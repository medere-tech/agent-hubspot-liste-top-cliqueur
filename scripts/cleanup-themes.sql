-- =========================================================================
-- Nettoyage contact_click_themes
--   1. Retire du JSONB `themes` les entrees clicks < 3
--   2. Supprime les lignes dont `themes` est vide apres nettoyage
-- A executer dans le SQL Editor Supabase.
-- Sauvegarde recommandee avant l'etape 2.
-- =========================================================================


-- 1. APERCU (dry-run) - combien de lignes vont etre touchees.
WITH cleaned AS (
  SELECT
    email,
    themes AS old_themes,
    COALESCE(
      (
        SELECT jsonb_agg(t ORDER BY (t->>'clicks')::int DESC)
        FROM jsonb_array_elements(themes) t
        WHERE (t->>'clicks')::int >= 3
      ),
      '[]'::jsonb
    ) AS new_themes
  FROM public.contact_click_themes
)
SELECT
  COUNT(*)                                                       AS total_rows,
  COUNT(*) FILTER (WHERE old_themes IS DISTINCT FROM new_themes) AS rows_to_update,
  COUNT(*) FILTER (WHERE new_themes = '[]'::jsonb)               AS rows_to_delete
FROM cleaned;


-- 2. CLEANUP atomique (UPDATE puis DELETE dans une transaction).
BEGIN;

UPDATE public.contact_click_themes AS c
SET themes = cleaned.new_themes
FROM (
  SELECT
    email,
    COALESCE(
      (
        SELECT jsonb_agg(t ORDER BY (t->>'clicks')::int DESC)
        FROM jsonb_array_elements(themes) t
        WHERE (t->>'clicks')::int >= 3
      ),
      '[]'::jsonb
    ) AS new_themes
  FROM public.contact_click_themes
) AS cleaned
WHERE c.email = cleaned.email
  AND c.themes IS DISTINCT FROM cleaned.new_themes;

DELETE FROM public.contact_click_themes
WHERE jsonb_array_length(themes) = 0;

COMMIT;


-- 3. VERIFICATION post-cleanup. Doit afficher 0 sur les deux dernieres colonnes.
SELECT
  COUNT(*) AS rows_remaining,
  COUNT(*) FILTER (WHERE jsonb_array_length(themes) = 0) AS rows_with_empty_themes,
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM jsonb_array_elements(themes) t
      WHERE (t->>'clicks')::int < 3
    )
  ) AS rows_with_remaining_under_3
FROM public.contact_click_themes;
