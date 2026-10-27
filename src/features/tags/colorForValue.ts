/**
 * Distinkta, läsbara färger för materialförslag – samma textvärde ger alltid samma färg.
 * Fler färger ger färre kollisioner mellan olika material (med bara 8 färger möts två av fyra
 * slumpmässiga värden i ~60 % av fallen).
 */
const PALETTE = [
  '#efa30f',
  '#2f8f6f',
  '#6c5ce7',
  '#e4572e',
  '#1f78b4',
  '#c2185b',
  '#558b2f',
  '#8d6e63',
  '#00897b',
  '#5d4037',
  '#7cb342',
  '#3949ab',
  '#d81b60',
  '#f57c00',
  '#00acc1',
  '#8e24aa',
]

export function colorForValue(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return 'transparent'

  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0
  }
  return PALETTE[hash % PALETTE.length]
}

/**
 * Taggens egen färg som en läsbar chip-stil (ljus tonad bakgrund + samma färg som text) istället
 * för en liten prick bredvid text – samma mönster återanvänds överallt en tagg visas (taggpalett,
 * applicerat material, taggöversikt), så det alltid går att känna igen en tagg på samma sätt.
 * Fungerar med alla PALETTE-färgerna eftersom de redan är mörka/mättade nog att läsas som text.
 */
export function tagChipStyle(value: string): { background: string; color: string } {
  const color = colorForValue(value)
  if (color === 'transparent') return { background: 'transparent', color: 'inherit' }
  return { background: `${color}1f`, color }
}
