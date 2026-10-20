import type { PDFPageProxy } from 'pdfjs-dist'

/**
 * Matchar t.ex. "PLAN 20" – mönstret som validerades mot riktiga FOJAB-ritningar i förstudien.
 * Ritningar som inte följer konventionen faller tillbaka på manuell namngivning av nivån.
 */
const LEVEL_LABEL_REGEX = /PLAN\s*\d+/i

/**
 * Hittar troligaste nivåetiketten på en ritningssida genom att leta efter textrader som matchar
 * mönstret och välja den med störst teckenstorlek (ritningens rubrik, inte en hänvisningstext).
 */
export async function detectLevelLabel(page: PDFPageProxy): Promise<string | null> {
  const textContent = await page.getTextContent()
  let best: { text: string; size: number } | null = null

  for (const item of textContent.items) {
    if (!('str' in item)) continue
    const text = item.str.trim()
    if (!text || !LEVEL_LABEL_REGEX.test(text)) continue

    // transform = [scaleX, skewX, skewY, scaleY, x, y]; teckenstorlek ~ längden av (scaleX, skewX).
    const [a, b] = item.transform
    const size = Math.hypot(a, b)

    if (!best || size > best.size) {
      best = { text, size }
    }
  }

  return best ? best.text.toUpperCase().replace(/\s+/g, ' ') : null
}
