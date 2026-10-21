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
