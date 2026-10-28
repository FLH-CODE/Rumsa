import { db, type RoomCategory } from '../../db'

/**
 * Distinkta, läsbara färger för materialtaggar. Tilldelas per tagg vid skapandet (se
 * nextTagColorIndex) så att alla taggar inom SAMMA kategori garanterat får olika färg – en
 * textbaserad hash (tidigare lösning) kunde annars råka ge två olika taggkoder exakt samma färg.
 * Samma färg kan däremot återanvändas mellan olika kategorier, det är inget problem eftersom en
 * tagg aldrig visas blandat med en annan kategoris taggar.
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

export function colorForIndex(colorIndex: number): string {
  return PALETTE[((colorIndex % PALETTE.length) + PALETTE.length) % PALETTE.length]
}

/**
 * Nästa lediga färgindex bland projektets taggar inom just den kategorin – körs en gång per ny
 * tagg (se PaletteTagCreate/TagEditSheet), inte vid varje visning, så att en taggs färg sedan
 * ligger fast oavsett vilka andra taggar som senare skapas eller tas bort.
 */
export async function nextTagColorIndex(projectId: string, category: RoomCategory): Promise<number> {
  const existing = await db.materialTags.where('projectId').equals(projectId).filter((t) => t.category === category).toArray()
  const used = new Set(existing.map((t) => t.colorIndex))
  let index = 0
  while (used.has(index)) index++
  return index
}

/**
 * Taggens egen färg som en läsbar chip-stil (ljus tonad bakgrund + samma färg som text) istället
 * för en liten prick bredvid text – samma mönster återanvänds överallt en tagg visas (taggpalett,
 * applicerat material, taggöversikt), så det alltid går att känna igen en tagg på samma sätt.
 * `undefined` (t.ex. en borttagen tagg som en referens pekar på) ger en neutral, färglös stil.
 */
export function tagChipStyle(colorIndex: number | undefined): { background: string; color: string } {
  if (colorIndex === undefined) return { background: 'transparent', color: 'inherit' }
  const color = colorForIndex(colorIndex)
  return { background: `${color}1f`, color }
}
