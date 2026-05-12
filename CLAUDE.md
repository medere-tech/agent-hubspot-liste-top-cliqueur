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
      cron/sync-contacts/         # Cron Vercel — sync paginée 1x/jour à 1h UTC
      admin/
        users/                    # GET liste / POST création
        users/[id]/               # PATCH update (role, is_active, email, full_name)
        users/[id]/reset-password # POST reset par un admin
      profile/
        password/                 # POST changement de son propre mot de passe
      contacts/
        [email]/                  # GET fiche contact (Supabase + HubSpot enrichment)
        by-theme/                 # GET non-inscrits avec thèmes (filtre theme optionnel)
        inscrits/                 # GET inscrits avec thèmes (filtre theme optionnel)
      hubspot/
        campaigns/                # GET campagnes email HubSpot (vue dashboard principal)
        listes/                   # GET listes existantes / POST création liste
        thematiques/              # GET agrégat thèmes par contact (Supabase)
        top-cliqueurs/            # GET top 100 cliqueurs (HubSpot lifetime + Airtable)
    login/                        # Page de connexion
    dashboard/
      page.tsx                    # Vue principale (thématiques campagnes + filtres)
      thematiques/page.tsx        # Vue agrégée par thème (Supabase)
      top-cliqueurs/page.tsx      # Top cliqueurs avec pagination
      listes/page.tsx             # Création et gestion des listes HubSpot
      contacts/[email]/page.tsx   # Fiche détail contact (thèmes, clics, inscriptions)
      export/page.tsx             # Export CSV
      admin/users/page.tsx        # Gestion utilisateurs (admin only)
      profile/                    # Profil utilisateur (server + client form)
      layout.tsx                  # Layout dashboard avec sidebar
  lib/
    auth.ts                       # Config NextAuth (authorize + JWT/Session callbacks)
    hubspot.ts                    # Client HubSpot (parseEmailName, normalizeTheme, isCommercial)
    airtable.ts                   # Client Airtable (inscriptions)
    supabase.ts                   # Client Supabase admin (service_role)
    sync.ts                       # Pipeline sync HubSpot → Supabase
    csv.ts                        # Utilitaire CSV partagé (BOM UTF-8, ;, CRLF)
  components/
    sidebar.tsx                   # Navigation latérale (lien Admin conditionnel)
  types/
    next-auth.d.ts                # Augmentation User/Session/JWT (role + name)
  proxy.ts                        # Protection des routes (session + guard admin) — renommé depuis middleware.ts (Next.js 16)
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
  eligible_dpc    TEXT,            -- "true" | "false" | NULL (cf. section Éligibilité DPC)
  last_synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Index partiel pour le filtre eligible_dpc (NULL exclus)
CREATE INDEX idx_contact_click_themes_eligible_dpc
  ON public.contact_click_themes (eligible_dpc)
  WHERE eligible_dpc IS NOT NULL;
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

### Table `user_profiles` (gestion des accès)

```sql
CREATE TABLE public.user_profiles (
  id            UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT         NOT NULL UNIQUE,
  full_name     TEXT         NOT NULL,
  role          TEXT         NOT NULL DEFAULT 'user',
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  CONSTRAINT user_profiles_role_check
    CHECK (role IN ('admin', 'user')),
  CONSTRAINT user_profiles_email_medere_only
    CHECK (email ~* '^[^@\s]+@medere\.fr$')
);
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
```

RLS activée **sans policy** → seul le `service_role` (BYPASSRLS) accède. L'app passe par `createSupabaseAdmin()` côté serveur uniquement. Bootstrap : `arnaud@medere.fr` + `dethie@medere.fr` (admins).

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

**Champ `kind` retourné par `parseEmailName`** : `'dpc' | 'webinaire' | 'newsletter' | 'commercial' | 'unknown'`. Utilisé par `sync.ts` pour filtrer (`commercial` et `webinaire` exclus de la sync).

## Avancement (mai 2026)

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
| Export CSV centralisé (thématiques, inscrits, non inscrits) | `app/dashboard/export/`, `lib/csv.ts` |
| Croisement HubSpot × Airtable (inscrits/non-inscrits) | `lib/sync.ts`, `lib/airtable.ts` |
| Pipeline sync paginé (150 contacts/run → thèmes → Supabase upsert, cap 10 000) | `lib/sync.ts` |
| Cron Vercel 1x/jour à 1h UTC (cycle complet ~67j, limite Hobby Vercel) | `app/api/cron/sync-contacts/`, `vercel.json` |
| Sidebar navigation | `components/sidebar.tsx` |
| Normalisation thèmes (strip + alias + GARBAGE_PATTERNS) | `lib/hubspot.ts` |
| Exclusion campagnes commerciales/webinaires de la sync (`kind`) | `lib/hubspot.ts`, `lib/sync.ts` |
| DELETE ligne au sync quand 0 thème (nettoyage fossiles) | `lib/sync.ts` |
| Fiche détail contact (Supabase + enrichment HubSpot) | `app/api/contacts/[email]/`, `app/dashboard/contacts/[email]/` |
| Gestion utilisateurs (table user_profiles + CRUD admin) | `app/api/admin/users/*`, `app/dashboard/admin/users/` |
| Changement mot de passe self-service | `app/api/profile/password/`, `app/dashboard/profile/` |
| Augmentation types NextAuth (role + name) | `types/next-auth.d.ts` |
| Filtre éligibilité DPC (sync + routes + UI + export) | `lib/hubspot.ts`, `lib/sync.ts`, `app/api/contacts/*`, `app/dashboard/listes/`, `app/dashboard/export/` |
| Migration `proxy.ts` (Next.js 16 — `middleware.ts` deprecated) | `src/proxy.ts` |
| ESLint 0 erreur 0 warning (Pattern A : `eslint-disable` sur fetch-then-setState, Pattern B : `setPage`/`setCreateResult` dans handlers, Pattern C : lazy initializers + `key` sur modale) | `app/dashboard/*`, `app/api/hubspot/*` |

### Post-MVP (ne pas implémenter maintenant)

- Analyse IA Claude pour scoring thématique
- Notifications automatiques
- Intégration d'autres outils

## Architecture des thèmes

**Source unique de parsing** : `parseEmailName` dans `src/lib/hubspot.ts`. Utilisée par les deux pipelines (live `getMarketingEmails` + sync `getContactClickThemes`). Tout changement de format se fait à un seul endroit.

### `normalizeTheme` — pipeline de nettoyage

Appelé en sortie de chaque branche de `parseEmailName`. Ordre des opérations :

1. **Strip préfixes** : dates `\d{4,8}[\s_]+`, `Suivi`, DPC `(EL|CV|PRES)[/\s-]+(MG|CD|MK|SF|PSY|PED|GYN|PLURIPRO)?[\s-]*`, RM RAPPEL (→ early return `''`), RM SYNTHESE, `RM\d+\s*-`, `RM\d+\s*$` (orphelin), `Primo inscrits`, `Version \w+\s*[-:]`.
2. **Strip suffixes** : `(Nème envoi)`, `(Cloner)`, `(Copy)`, `(Variation)`, `Relance` final, parenthèses orphelines, tirets orphelins.
3. **Normalisation finale** : collapse whitespace, trim, capitalize première lettre.
4. **`GARBAGE_PATTERNS` (pre-alias)** : filet de sûreté si le strip a raté. Matche `^Rappel J\d+`, `^\d+ formations?`, `^\(\d+ formations?\)`, `^CV\s*-`, `^PRES\s*-`, `^EL\s*-`, `^Version\s`, `^Quizz?\s`, `^Dangers$`. Si match → `return ''`.
5. **`THEME_ALIASES` lookup** (54 entrées) : dédoublonne les variantes connues (`HTA` → `Hypertension artérielle`, `Sommeil` → `Troubles du sommeil`, `Perturbateur endo` → `Perturbateurs endocriniens`, etc.).

### `isCommercial` — exclusion au niveau campagne

Matche le **rawName** complet (ancré `^` ou pas selon le pattern). Si une de ces regex match, `parseEmailName` retourne `kind: 'commercial'` :
- `black friday`, `flash sales?`, `saint.?valentin`, `\boffre\b`, `fin d'année`, `budget`, `confirmation`, `ouverture budget`
- `livre blanc`, `^quizz?\s`, `^\d+\s+formations?`, `^\(\d+\s+formations?\)`, `^dangers$`
- `^Rappel\s+J[+-]?\d+` (J-2, J-8, J-23)

### `kind` retourné par `parseEmailName`

`'dpc' | 'webinaire' | 'newsletter' | 'commercial' | 'unknown'`. Pipeline DPC reconnu uniquement pour `kind === 'dpc'`.

### Filtres `sync.ts`

Pour chaque campagne d'un contact :
- skip si `kind === 'commercial'` ou `kind === 'webinaire'`
- skip si `theme === ''` ou `theme === 'Sans thème'` ou `theme === 'Newsletter'`
- agrège par thème, **skip thème final si `clicks < 3`**

**Si un contact n'a aucun thème valide après filtrage** → `DELETE FROM contact_click_themes WHERE email = ...`. C'est volontaire : empêche les fossiles d'anciennes versions du code de persister en base. Décision documentée dans `sync.ts:305`.

## Architecture des filtres de la page Listes

La page `/dashboard/listes` propose **3 modes** pour la création de listes HubSpot — tous lisent `contact_click_themes` Supabase comme source unique. Le filtre `clicks >= 3` est garanti par `sync.ts` au moment du sync, donc tout thème stocké est par définition "qualifié".

| Mode | Route API | Filtre Supabase | Filtre thématique |
|---|---|---|---|
| `inscrits` | `GET /api/contacts/inscrits[?theme=X]` | `is_inscrit = true` ET `themes` non vide | dropdown alimenté par `uniqueThemes` de la réponse |
| `non_inscrits` | `GET /api/contacts/by-theme[?theme=X]` | `is_inscrit = false` ET `themes` non vide | idem |
| `prospects_chauds` | `GET /api/contacts/by-theme?theme=X` (theme requis) | `is_inscrit = false` ET match exact thème (case-insensitive) | défini par URL — accessible via le lien de `/dashboard/thematiques` |

**Mode `thematique` retiré** (avril 2026). Il filtrait `topData.segments.inscrits` par substring sur `nomFormation` Airtable — sémantiquement faux (le nom de formation Airtable n'est pas le thème HubSpot). Remplacé par `inscrits + dropdown thème Supabase`, qui fait un match exact.

**Aucune route ne dépend plus de `getTopClickersEnriched` pour les modes de listes** — `topData` n'est plus fetché au mount. La page Listes ne consomme que Supabase, et hérite donc de la fraîcheur du cron (1×/jour).

**Composants factorisés** : `PreviewTable` + `ThemeFilterDropdown` partagés entre les 3 modes.

## Gestion des utilisateurs

### Modèle de données

Table `public.user_profiles` (cf. section Schéma Supabase) — étend `auth.users` avec rôle et statut applicatif. **Pas de table custom pour les credentials** : le bcrypt reste géré par Supabase Auth (GoTrue) via `auth.users.encrypted_password`.

### Flow d'authentification — IMPORTANT

`authorize()` dans `lib/auth.ts` enchaîne :
1. `supabase.auth.signInWithPassword({ email, password })` → vérif bcrypt côté Supabase
2. SELECT sur `user_profiles` pour récupérer `role` + `is_active` + `full_name`
3. Si profil absent ou `is_active = false` → return null (login refusé)
4. UPDATE `last_login_at` fire-and-forget
5. Return `{ id, email, name, role }` → propagé via callbacks `jwt()` et `session()`

**⚠️ Piège à éviter — client Supabase séparé pour le SELECT profil.** Après `signInWithPassword`, l'instance Supabase est "tainté" : le contexte auth bascule vers le JWT utilisateur, et les requêtes PostgREST qui suivent l'utilisent au lieu du `service_role`. Avec RLS activée et 0 policy, ça retourne 0 lignes → login systématiquement refusé. **Fix** : appeler `createSupabaseAdmin()` une seconde fois pour avoir un client neuf avec service_role pure. Documenté dans `lib/auth.ts:23`.

### Routes

| Méthode + route | Guard | Action |
|---|---|---|
| `GET /api/admin/users` | admin | Liste tous les profils |
| `POST /api/admin/users` | admin | Crée auth.users + user_profiles (validation `@medere.fr`) |
| `PATCH /api/admin/users/[id]` | admin | Update role/is_active/email/full_name. Garde-fou : ≥1 admin actif |
| `POST /api/admin/users/[id]/reset-password` | admin | Reset MDP par un admin |
| `POST /api/profile/password` | user | Changement de son propre MDP (re-auth avec ancien MDP) |

### Middleware

Guard admin sur `/dashboard/admin/*` (→ redirect `/dashboard`) et `/api/admin/*` (→ 403). Lit `session.user.role` depuis le JWT — pas de round-trip DB.

### Pages

- `/dashboard/admin/users` (admin only) : tableau + modale création + modale édition (email, nom, rôle, statut, reset password)
- `/dashboard/profile` (tous) : infos read-only + form changement mot de passe

### Sidebar

- Section « Administration » conditionnelle (`role === 'admin'`)
- User pill cliquable → `/dashboard/profile`

### Types augmentés

`src/types/next-auth.d.ts` étend `User`, `Session.user` et `JWT` avec `id: string` + `role: 'admin' | 'user'`. Note : casts `as string`/`as 'admin' | 'user'` requis dans `session()` callback car NextAuth v5 type le JWT avec `Record<string, unknown>` qui dégrade les types augmentés.

### Bootstrap

Admins initiaux : `arnaud@medere.fr` + `dethie@medere.fr` (mêmes droits). Création des comptes auth via Supabase Studio puis script SQL pour insérer le profil avec `role = 'admin'`.

### Limites assumées

- JWT signé en cookie (pas DB-backed) → désactivation/rétrogradation prend effet à la prochaine connexion (max 8h)
- Audit log absent (création/modification d'utilisateur non tracée) — hors scope MVP

## Fiche détail contact

- **Route** `/api/contacts/[email]` : lit `contact_click_themes` Supabase (source authoritative) puis enrichit best-effort avec HubSpot (firstname, lastname, hs_email_open, hs_email_delivered) — si HubSpot down, on retourne quand même les données Supabase
- **Page** `/dashboard/contacts/[email]` : metric cards (clics totaux, ouvertures, taux ouverture) + tableau des thèmes cliqués (cliquables) + tableau inscriptions Airtable
- **Liens entrants** : emails cliquables dans `/dashboard/top-cliqueurs` et `/dashboard/listes` (preview) → `Link` vers la fiche

## Export CSV

- **Page** `/dashboard/export` : 3 sections — Thématiques (tableau agrégé), Non inscrits, Inscrits
- **Utilitaire** `src/lib/csv.ts` : centralise le format (BOM UTF-8 pour Excel FR, séparateur `;`, fin de ligne CRLF)
- Top cliqueurs refactoré pour utiliser le même utilitaire — un seul endroit où le format peut diverger
- Inscrits et non inscrits incluent la colonne **Eligible DPC** (Oui / Non / vide) — cf. section Éligibilité DPC

## Éligibilité DPC

Permet à Arnaud de filtrer les contacts selon la qualification commerciale `Eligible DPC` saisie manuellement dans HubSpot (oui/non, ou non renseigné).

### Propriété HubSpot

- **Nom technique** : `eligible_dpc`
- **Type** : `enumeration` — valeurs `"true"` (label "Oui") / `"false"` (label "Non") / `null` (non renseignée)
- **Renseignement** : manuel par les commerciaux après le premier appel de qualification
- **Propriétés connexes disponibles mais non utilisées** : `hors_zone_dpc` (enum Oui/Non), `cause_de_non_eligibilite` (enum : Hospitalier ANFH, Etudiant, Retraité, Décédé, Remplaçant, Paramédical, Étranger, Secteur 3, Assistant dentaire, MK, IDE)

### Stockage Supabase

Colonne `contact_click_themes.eligible_dpc TEXT` (nullable). Index partiel `WHERE eligible_dpc IS NOT NULL` — la majorité des lignes restent `NULL` au début (pas de backfill) donc l'index ne couvre que ce qui est utile.

### Sync

`getTopClickers` (`lib/hubspot.ts`) inclut `eligible_dpc` dans les properties demandées au CRM v3 search. Normalisation à la sortie : `null` si absent/vide, sinon valeur brute (`"true"` ou `"false"`). Stocké à l'upsert dans `sync.ts`.

### Routes API

`/api/contacts/by-theme` et `/api/contacts/inscrits` acceptent un paramètre query optionnel `?eligible_dpc=true|false`. Toute autre valeur est ignorée silencieusement (validation stricte). Quand le paramètre est présent, le filtre `.eq('eligible_dpc', value)` est appliqué **côté Supabase au query** (pas en mémoire) — réduit drastiquement la fenêtre transférée. Le 3ème paramètre devient une clé de cache `unstable_cache` (3 variantes max : `'true'`, `'false'`, `undefined`).

Le champ `eligibleDpc: string | null` est renvoyé dans chaque prospect ET dans la racine de la réponse.

### UI page Listes

Composant `DpcFilter` (dropdown 3 options : Tous / Éligibles DPC / Non éligibles DPC) affiché pour les modes `inscrits` et `non_inscrits`. **Pas de filtre** en mode `prospects_chauds` (URL-driven, non supporté). État `string` géré par-source (`inscritsEligibleDpc`, `nonInscritsEligibleDpc`).

`PreviewTable` affiche la colonne "DPC" dans tous les modes (Oui / Non / —).

### Export CSV

Colonne "Eligible DPC" insérée dans les exports inscrits et non inscrits (avant Thèmes/Formations). Valeurs : `"Oui"` / `"Non"` / `""` (vide si NULL). Helper local `formatDpc()`.

### Fraîcheur — pas de backfill

Les ~10 000 contacts existants gardent `eligible_dpc = NULL` jusqu'à leur passage dans le cron (worst case ~67j). Décision validée : la propriété évolue lentement côté commerciaux, et un délai de quelques semaines avant qu'elle ne se reflète dans les listes est acceptable.

### Effet de bord du filtre

`uniqueThemes` retourné par les routes ne contient que les thèmes des contacts filtrés. Si l'utilisateur a sélectionné un thème puis active le filtre DPC, il peut se retrouver avec un thème qui n'a plus de contacts éligibles → message "Aucun X n'a cliqué sur ce thème". Acceptable, pas de reset automatique du dropdown.

## Décisions techniques

| Décision | Raison |
|---|---|
| `service_role` pour toutes les writes Supabase | Sync s'exécute côté serveur (cron + API route), pas de session utilisateur |
| HubSpot v1 Events API (non CRM v3) | Seule API qui expose les événements CLICK par email individuel |
| Throttle 150ms entre contacts HubSpot | Rate limit v1 API : ~100 req/10s — évite les 429 |
| Thèmes filtrés à >= 3 clics au sync | Seuil de pertinence — évite le bruit des clics accidentels. Tout thème en base est qualifié |
| Batches de 10 emails Airtable | Limite longueur URL des formules `filterByFormula` |
| CRM v3 search avec `filterGroups` EQ (5 par batch) | Contrainte HubSpot : max 5 filterGroups par requête search |
| Préfixe `[Agent]` sur les listes créées | Distinguer les listes app des listes manuelles, jamais supprimées |
| `NOTIFY pgrst, 'reload schema'` obligatoire | PostgREST ne détecte pas automatiquement les nouvelles tables |
| `parseEmailName` (lib/hubspot.ts) source unique de vérité pour le parsing du thème | Utilisée par les deux pipelines (live `getMarketingEmails` + sync `getContactClickThemes`). Tout changement de format se fait à un seul endroit |
| Routes `tags: ['hubspot']` + cron `revalidateTag('hubspot', { expire: 0 })` | Invalide tous les caches après chaque sync — évite les listes périmées |
| URL HubSpot EU : `app-eu1.hubspot.com/.../objectLists/{id}` | Portail Médéré hébergé en EU. Les URLs `/lists/` redirigent mais perdent les paramètres |
| Second client `createSupabaseAdmin()` après `signInWithPassword` dans `auth.ts` | Le premier client devient tainté (contexte auth bascule sur le JWT user) → SELECT user_profiles bloqué par RLS |
| GARBAGE_PATTERNS placés **pre-alias** dans `normalizeTheme` | Si le strip de préfixes a fait son job, la chaîne est déjà clean — GARBAGE ne fire pas inutilement. Sinon il rattrape les résidus (`CV - `, `Version `, etc.) |

## Bugs résolus

| Symptôme | Cause | Fix |
|---|---|---|
| Login refusé malgré profil correct | Client Supabase tainté par `signInWithPassword` utilise le JWT user → RLS bloque le SELECT `user_profiles` | Second `createSupabaseAdmin()` pour le SELECT/UPDATE profil |
| Thèmes parasites persistants en base après un deploy qui change le parsing | Sync forward-only : ne retouche que la fenêtre du jour (~150 contacts), les ~9 850 autres gardent leurs vieux thèmes. Et quand le nouveau code épure tout → skip upsert → fossile reste | `sync.ts:305` fait maintenant un `DELETE` quand `themes.length === 0` au lieu de skip. Pour reset complet après un deploy invasif : truncate + reset curseur |
| « Rappel J-23 », « 3 formations » et autres résidus dans les thèmes même avec `isCommercial` étendu | `isCommercial` est ancré `^` sur le rawName complet → si ces patterns sont en milieu de chaîne (`CV - MG - Rappel J-23 - Sommeil`), pas de match | `GARBAGE_PATTERNS` dans `normalizeTheme` agit sur la chaîne post-strip, attrape les patterns au milieu |
| PGRST205 — Could not find the table in the schema cache | PostgREST cache le schéma au démarrage. Une table créée sans notification reste invisible | `NOTIFY pgrst, 'reload schema';` dans l'éditeur SQL après création de table |

## TODO restants

- **Phase C alias map** : affiner `THEME_ALIASES` avec Arnaud après un cycle complet de sync (identifier les variantes vues en prod qui ne sont pas encore mappées)
- **Réparer WSL2** (env dev local)
- **Migrer Top cliqueurs sur Supabase** : clarifier le besoin avec Arnaud (aujourd'hui live HubSpot, lifetime clicks)
- **« Version New Gen… » dans `normalizeTheme`** : la regex `^(?:Primo\s+inscrits|Version\s+\w+)\s*[-:]\s*` exige `-` ou `:` après le préfixe Version + 1 mot. Trop strict pour « Version New Gen CV - CD - … ». **Partiellement résolu via GARBAGE_PATTERNS** (`/^Version\s/i` filtre maintenant), mais une amélioration du strip serait plus propre

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
