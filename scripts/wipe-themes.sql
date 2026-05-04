-- =========================================================================
-- Wipe themes contact_click_themes apres mise en prod du nouveau parseEmailName.
-- Le cron repeuplera progressivement avec les themes nettoyes.
-- A executer dans le SQL Editor Supabase.
-- =========================================================================

BEGIN;

-- 1. Vider tous les themes
UPDATE public.contact_click_themes SET themes = '[]'::jsonb;

-- 2. Supprimer les lignes desormais vides (toutes a ce stade)
DELETE FROM public.contact_click_themes WHERE jsonb_array_length(themes) = 0;

-- 3. Recommande : reset du curseur cron pour reparcourir depuis le debut.
-- Sans ca, le cron continue depuis sa position actuelle et ne reparcourt
-- l'ensemble qu'apres un cycle complet (~67 jours).
UPDATE public.sync_cursor SET current_offset = 0 WHERE id = 'main';

COMMIT;

-- Verification
SELECT
  (SELECT COUNT(*) FROM public.contact_click_themes)                AS rows_remaining,
  (SELECT current_offset FROM public.sync_cursor WHERE id = 'main') AS cursor_offset;
