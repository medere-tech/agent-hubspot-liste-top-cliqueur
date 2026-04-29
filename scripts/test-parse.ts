import { parseEmailName } from '../src/lib/hubspot'

const cases = [
  '(A) CV - MG - Sommeil (5ème envoi 032026)',
  'PRES - MG/PSY/PED - RM7 - TDAH (6ème envoi 032026)',
  'CV - CD (Clients) - Radioprotection (3ème envoi - 032026)',
  'CV - GYN/SF - Sexualité (1ère envoi 032026)',
  'PRES - PSY/CD - RM8 (Agressivité) (1ère envoi - 032026)',
  '2603_Webinaire · IA · Confirmation',
  'Newsletter #21 · 260308 · CD',
  '2603_SAMA_1',
]

for (const c of cases) {
  const r = parseEmailName(c)
  console.log(`\nINPUT : ${c}`)
  console.log(`  type      : ${r.type}`)
  console.log(`  audiences : [${r.audiences.join(', ')}]`)
  console.log(`  qualifier : ${r.qualifier}`)
  console.log(`  edition   : ${r.edition}`)
  console.log(`  theme     : ${r.theme}`)
  console.log(`  isABTest  : ${r.isABTest}`)
  console.log(`  envoi     : ${r.envoi}`)
  console.log(`  periode   : ${r.periode}`)
  console.log(`  subType   : ${r.subType}`)
}
