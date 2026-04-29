# CLAUDE.md — agent-hubspot-cliqueur

## Vue d'ensemble du projet

Application web Next.js connectée directement à HubSpot via son API officielle.
Permet à Arnaud (et futurs utilisateurs) d'analyser les clics par thématique sur les campagnes email HubSpot, segmenter les contacts et créer des listes directement dans HubSpot.

## Stack technique

- **Framework** : Next.js 16 (App Router, TypeScript)
- **Auth** : NextAuth.js v5 (beta) avec Supabase
- **Base de données** : Supabase (PostgreSQL) — hébergé EU Frankfurt (RGPD)
- **API externe** : HubSpot Marketing Hub Professional + Airtable REST API
- **Déploiement** : Vercel (déploiement automatique depuis GitHub)
- **Style** : Tailwind CSS — design minimaliste, monochrome, zéro couleur, zéro dégradé
- **Icons** : SVG uniquement — zéro emoji, zéro émoticône

## Règles de design NON NÉGOCIABLES

- Zéro couleur décorative — noir, blanc, gris uniquement
- Zéro dégradé
- Zéro emoji ou émoticône
- Icônes SVG inline uniquement
- Interface premium, minimaliste, SaaS haute qualité
- Responsive — adapté à tous les écrans de travail (desktop, laptop)
- Chaque élément affiché doit être utile

## Structure du projet

```
src/
  app/
    api/
      auth/[...nextauth]/         # Auth NextAuth
      cron/sync-contacts/         # Cron Vercel — sync paginée toutes les 6h
      hubspot/
        campaigns/                # GET campagnes email HubSpot
        listes/                   # GET listes existantes / POST création liste
        top-cliqueurs/            # GET top cliqueurs (360 jours)
    login/                        # Page de connexion
    dashboard/
      page.tsx                    # Vue principale (thématiques + filtres)
      thematiques/page.tsx        # Dashboard thématiques
      top-cliqueurs/page.tsx      # Top cliqueurs avec pagination
      listes/page.tsx             # Création et gestion des listes HubSpot
      export/page.tsx             # Export CSV
      layout.tsx                  # Layout dashboard avec sidebar
  lib/
    auth.ts                       # Config NextAuth
    hubspot.ts                    # Client HubSpot (getTopClickers, parseEmailName)
    airtable.ts                   # Client Airtable (inscriptions)
    supabase.ts                   # Client Supabase admin (service_role)
    sync.ts                       # Pipeline sync HubSpot → Supabase
  components/
    sidebar.tsx                   # Navigation latérale
  middleware.ts                   # Protection des routes
vercel.json                       # Config cron Vercel
```

## Sécurité — règles absolues

- Zéro token HubSpot/Airtable côté client — tout passe par les API routes Next.js
- Variables d'environnement Vercel uniquement (jamais dans le code)
- Rate limiting sur toutes les routes API
- Sessions JWT signées, expiration 8h
- CORS strict
- .env.local jamais committé sur GitHub (.gitignore couvre .env*)

## Variables d'environnement

```
HUBSPOT_ACCESS_TOKEN=           # Token app privée HubSpot
NEXT_PUBLIC_SUPABASE_URL=       # URL projet Supabase (EU Frankfurt)
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Clé publique Supabase
SUPABASE_SERVICE_ROLE_KEY=      # Clé service role (jamais côté client)
NEXTAUTH_SECRET=                # Secret JWT généré via openssl
NEXTAUTH_URL=                   # URL app (localhost:3000 en dev, vercel en prod)
AIRTABLE_ACCESS_TOKEN=          # Token personnel Airtable
AIRTABLE_BASE_ID=               # ID de la base Airtable (app3GnMOzJn7VHMji ou URL complète)
CRON_SECRET=                    # Secret Bearer pour protéger /api/cron/sync-contacts
```

## Schéma Supabase — table à créer

La table `contact_click_themes` doit exister dans le schéma `public` avant toute sync.

```sql
CREATE TABLE public.contact_click_themes (
  email           TEXT PRIMARY KEY,
  contact_id      TEXT NOT NULL,
  total_clicks    INTEGER NOT NULL DEFAULT 0,
  themes          JSONB NOT NULL DEFAULT '[]',
  is_inscrit      BOOLEAN NOT NULL DEFAULT FALSE,
  inscriptions    JSONB NOT NULL DEFAULT '[]',
  last_synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Structure des champs JSONB :

```json
-- themes (ThemeCount[])
[{ "theme": "Sommeil", "clicks": 12, "lastClick": "2026-03-15T10:00:00Z" }]

-- inscriptions
[{ "nomFormation": "CV Sommeil", "specialite": "MG", "dateCreation": "2025-11-01" }]
```

Après création de la table, toujours exécuter dans l'éditeur SQL Supabase :
```sql
NOTIFY pgrst, 'reload schema';
```
Sans ça, PostgREST retourne `PGRST205 — Could not find the table in the schema cache`.

## Structure Airtable

**Table** : `tblTOJHEwCQhibcMM` (inscriptions formation)

| Champ | Field ID | Type |
|---|---|---|
| Email | `fldZmubHrX9S44BUy` | email |
| Nom formation | `fldPPQhzeUKKa3hND` | text |
| Apprenant | `fldGiubhYwR32RUPs` | text |
| Date création | `fldLNmbnKeu7Sc2eZ` | date |
| Spécialité | `fldCzrRaZNMbizqhi` | text |
| Désinscriptions | `fld6cCF7tZfbcr7Um` | text — vide = inscrit actif |

L'API Airtable est toujours appelée avec `returnFieldsByFieldId=true` (clés stables).
Les inscriptions sont filtrées par batch de 10 emails (limite URL) avec formule `LOWER()` pour la casse.

## Scopes HubSpot configurés

- `crm.lists.read`
- `crm.lists.write`
- `crm.objects.contacts.read`
- `marketing.campaigns.read`
- `marketing-emails.read` *(nécessaire pour /email/public/v1/events)*

## Convention de nommage des campagnes HubSpot

Les emails HubSpot suivent ce pattern :
```
[TYPE] - [AUDIENCE] - [OPTIONNEL: édition] - [THÉMATIQUE] (Xème envoi MMAAAA)
```

**Types :**
- `CV` = Classe Virtuelle
- `PRES` = Présentiel
- `(A)` en préfixe = A/B testing

**Audiences :**
- `MG` = Médecins Généralistes
- `CD` = Chirurgiens-Dentistes
- `MK` = Masseurs-Kinésithérapeutes
- `prospect` / `clients` = segmentation commerciale

**Éditions spéciales :**
- `RM7` = 7ème édition des Rencontres Médéré

**Exemples :**
- `(A) CV - MG - Sommeil (5ème envoi 032026)` → Classe Virtuelle, MG, thème: Sommeil
- `PRES - CD - RM7 - Chirurgie guidée (2eme envoi 032026)` → Présentiel, CD, RM7, thème: Chirurgie guidée
- `CV - MK - Pathologies de l'épaule (3eme envoi 032026)` → Classe Virtuelle, MK, thème: Pathologies de l'épaule

## Avancement MVP (avril 2026)

### Fait

| Fonctionnalité | Fichier(s) |
|---|---|
| Auth login/mot de passe (NextAuth + Supabase) | `lib/auth.ts`, `app/login/` |
| Dashboard thématiques avec filtres type/audience | `app/dashboard/thematiques/` |
| Top cliqueurs — pagination, cache 5 min, export CSV | `app/dashboard/top-cliqueurs/` |
| Création de listes HubSpot statiques depuis l'app | `app/api/hubspot/listes/` |
| Listes préfixées `[Agent]` (jamais supprimées) | idem |
| Résolution contact IDs via CRM v3 search (batches de 5 en parallèle) | idem |
| Page gestion listes (vue + création) | `app/dashboard/listes/` |
| Export CSV | `app/dashboard/export/` |
| Croisement HubSpot × Airtable (inscrits/non-inscrits) | `lib/sync.ts`, `lib/airtable.ts` |
| Pipeline sync paginé (150 contacts/run → thèmes → Supabase upsert, cap 10 000) | `lib/sync.ts` |
| Cron Vercel toutes les 6h (4x/jour, cycle complet ~23j) | `app/api/cron/sync-contacts/`, `vercel.json` |
| Sidebar navigation | `components/sidebar.tsx` |

### En cours / Bloquant

**Problème Supabase PGRST205** : la table `contact_click_themes` n'est pas visible par PostgREST après sa création.

- Cause : PostgREST cache le schéma au démarrage. Une table créée sans `NOTIFY pgrst, 'reload schema'` reste invisible.
- Solution : exécuter `NOTIFY pgrst, 'reload schema';` dans l'éditeur SQL Supabase après création de la table.
- Test de validation : `npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/test-supabase.ts`

### Post-MVP (ne pas implémenter maintenant)

- Analyse IA Claude pour scoring thématique
- Notifications automatiques
- Intégration d'autres outils

## Décisions techniques

| Décision | Raison |
|---|---|
| `service_role` pour toutes les writes Supabase | Sync s'exécute côté serveur (cron + API route), pas de session utilisateur |
| HubSpot v1 Events API (non CRM v3) | Seule API qui expose les événements CLICK par email individuel |
| Throttle 150ms entre contacts HubSpot | Rate limit v1 API : ~100 req/10s — évite les 429 |
| Thèmes filtrés à >= 3 clics | Seuil de pertinence — évite le bruit des clics accidentels |
| Batches de 10 emails Airtable | Limite longueur URL des formules `filterByFormula` |
| CRM v3 search avec `filterGroups` EQ (5 par batch) | Contrainte HubSpot : max 5 filterGroups par requête search |
| Préfixe `[Agent]` sur les listes créées | Distinguer les listes app des listes manuelles, jamais supprimées |
| `NOTIFY pgrst, 'reload schema'` obligatoire | PostgREST ne détecte pas automatiquement les nouvelles tables |

## Workflow de développement

1. Coder avec Claude Code dans le terminal VS Code
2. Vérifier dans le navigateur sur localhost:3000
3. Commiter via GitHub Desktop
4. Vercel déploie automatiquement depuis GitHub

## Commandes utiles

```bash
npm run dev          # Lancer le serveur de développement
npm run build        # Build de production
npm run lint         # Vérifier le code

# Scripts de test (ne pas commiter les résultats)
npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/test-supabase.ts
npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/test-sync.ts
```

## Contexte métier

- **Client final** : Arnaud (marketing automation chez Médéré)
- **Médéré** : organisme de formation médicale et dentaire certifié DPC
- **Objectif** : segmenter les contacts selon leur appétence thématique pour personnaliser les campagnes email
- **L'app doit être durable** : si Arnaud quitte l'entreprise, son remplaçant doit pouvoir l'utiliser sans formation.
