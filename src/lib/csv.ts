/**
 * Génère et télécharge un fichier CSV côté navigateur.
 *
 * - BOM UTF-8 en tête → Excel ouvre les accents correctement
 * - Séparateur point-virgule → format Excel FR par défaut
 * - Quoting RFC 4180 : chaque cellule entourée de doubles guillemets,
 *   les guillemets internes sont doublés
 * - Ligne CRLF (\r\n) → conforme RFC 4180
 */
export function downloadCSV(
  filename: string,
  headers: string[],
  rows: string[][]
): void {
  const SEPARATOR = ';'
  const escape = (cell: string): string =>
    `"${String(cell ?? '').replace(/"/g, '""')}"`

  const csv = [headers, ...rows]
    .map((row) => row.map(escape).join(SEPARATOR))
    .join('\r\n')

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
