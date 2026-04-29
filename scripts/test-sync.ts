/**
 * Tests the full sync pipeline with cursor backup/restore.
 * Processes 5 contacts starting from current cursor offset, then restores
 * the cursor to its pre-test value — never pollutes prod state.
 *
 * Usage: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/test-sync.ts
 */

import { syncAllTopClickers } from '@/lib/sync'
import { createSupabaseAdmin } from '@/lib/supabase'

async function main() {
  console.log('='.repeat(60))
  console.log('TEST SYNC — 5 contacts (curseur restauré à la fin)')
  console.log('='.repeat(60))

  const supabase = createSupabaseAdmin()

  // ── Backup cursor state ─────────────────────────────────────────────────
  const { data: backup, error: backupErr } = await supabase
    .from('sync_cursor')
    .select('*')
    .eq('id', 'main')
    .maybeSingle()

  if (backupErr) {
    console.error('FATAL — backup curseur impossible:', backupErr.message)
    process.exit(1)
  }

  console.log('Backup curseur:', JSON.stringify(backup))
  console.log('='.repeat(60))

  try {
    const result = await syncAllTopClickers((msg) => console.log(msg), 5)

    console.log('='.repeat(60))
    console.log('RÉSUMÉ')
    console.log(`  Synced             : ${result.synced}`)
    console.log(`  Errors             : ${result.errors}`)
    console.log(`  Duration           : ${(result.duration / 1000).toFixed(1)}s`)
    console.log(`  StartOffset        : ${result.startOffset}`)
    console.log(`  EndOffset          : ${result.endOffset}`)
    console.log(`  TotalContacts      : ${result.totalContacts}`)
    console.log(`  FullCycleCompleted : ${result.fullCycleCompleted}`)
    console.log(`  Skipped            : ${result.skipped}`)
  } finally {
    // ── Restore cursor ────────────────────────────────────────────────────
    if (backup) {
      const { error } = await supabase.from('sync_cursor').upsert(backup)
      if (error) {
        console.error('='.repeat(60))
        console.error('⚠ ÉCHEC RESTORE CURSEUR — reset manuel requis')
        console.error('Backup:', JSON.stringify(backup, null, 2))
        console.error('Erreur:', error.message)
        console.error('='.repeat(60))
        process.exit(1)
      }
      console.log('='.repeat(60))
      console.log('Curseur restauré à sa valeur initiale')
      console.log('='.repeat(60))
    } else {
      console.log('Pas de backup à restaurer (row sync_cursor inexistante au départ)')
    }
  }
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
