import type { PDFPageProxy } from 'pdfjs-dist'

export interface DetectedRoom {
  roomNumber: string
  roomName: string
  /** PDF-sidans punktkoordinater (oroterat, pdfjs textorigin). */
  tagX: number
  tagY: number
}

/** Matchar t.ex. "13,9 m²" – används för att utesluta areatexter när rumsnamnet letas fram. */
const AREA_PATTERN = /^\d+[,.]?\d*\s*m.?$/

/**
 * Max avstånd (PDF-punkter) mellan ett rumsnummer och dess areatext för att räknas som ett
 * äkta rumstagg. Validerat mot en riktig ritning: alla 34 rumsnummer låg inom 25–29 punkter
 * från sin area, medan alla måttsatta sträckor (t.ex. "9340" för en väggsträcka) låg minst
 * 80 punkter bort – dimensionssiffror matchar annars samma \d{3,4}-mönster som rumsnummer.
 */
const MAX_AREA_DISTANCE = 50

interface TextLine {
  text: string
  x: number
  y: number
}

/**
 * Hittar rumstaggar på en sida: Revit lägger Nummer/Namn/Area som en tät, roterad textgrupp
 * per rum. Validerat mot riktiga FOJAB-ritningar i förstudien – närmaste icke-nummer/icke-area-
 * text till en rumsnummer-kandidat är tillförlitligt rumsnamnet, oavsett rotation. Kräver även
 * en areatext inom kort avstånd för att sålla bort måttsiffror som annars matchar samma mönster.
 */
export async function detectRooms(page: PDFPageProxy, roomNumberPattern: RegExp): Promise<DetectedRoom[]> {
  const textContent = await page.getTextContent()
  const lines: TextLine[] = []

  for (const item of textContent.items) {
    if (!('str' in item)) continue
    const text = item.str.trim()
    if (!text) continue
    const [, , , , x, y] = item.transform
    lines.push({ text, x, y })
  }

  const numberCandidates = lines.filter((l) => roomNumberPattern.test(l.text))
  const areaLines = lines.filter((l) => AREA_PATTERN.test(l.text))
  const results: DetectedRoom[] = []

  for (const candidate of numberCandidates) {
    const hasNearbyArea = areaLines.some(
      (area) => Math.hypot(area.x - candidate.x, area.y - candidate.y) <= MAX_AREA_DISTANCE,
    )
    if (!hasNearbyArea) continue

    let best: { text: string; dist: number } | null = null
    for (const line of lines) {
      if (line === candidate) continue
      if (roomNumberPattern.test(line.text) || AREA_PATTERN.test(line.text)) continue

      const dist = Math.hypot(line.x - candidate.x, line.y - candidate.y)
      if (!best || dist < best.dist) best = { text: line.text, dist }
    }

    if (best) {
      results.push({ roomNumber: candidate.text, roomName: best.text, tagX: candidate.x, tagY: candidate.y })
    }
  }

  return results
}
