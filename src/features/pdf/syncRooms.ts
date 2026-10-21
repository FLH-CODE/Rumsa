import type { PDFPageProxy } from 'pdfjs-dist'
import { db, createId, type DrawingPage } from '../../db'
import { detectRooms } from './detectRooms'

/**
 * Kör rumstaggdetektering för en sida och uppdaterar Room-posterna för just den sidan.
 * Används både vid import och när användaren manuellt vill detektera om (t.ex. efter att
 * ha justerat projektets rumsnummerformat).
 *
 * Matchar mot befintliga rum på rumsnummer och behåller deras id vid omdetektering – annars
 * skulle varje ny detektering koppla bort redan ifylld inventeringsdata, eftersom
 * InventoryRecord pekar på rummets id.
 */
export async function syncRoomsForPage(
  page: PDFPageProxy,
  drawingPage: Pick<DrawingPage, 'id' | 'projectId' | 'levelId'>,
  roomNumberPatternSource: string,
): Promise<number> {
  const pattern = new RegExp(roomNumberPatternSource)
  const detected = await detectRooms(page, pattern)

  await db.transaction('rw', db.rooms, async () => {
    const existing = await db.rooms.where('drawingPageId').equals(drawingPage.id).toArray()
    const existingByNumber = new Map(existing.map((r) => [r.roomNumber, r]))
    const detectedNumbers = new Set(detected.map((d) => d.roomNumber))

    for (const room of detected) {
      const match = existingByNumber.get(room.roomNumber)
      if (match) {
        await db.rooms.update(match.id, {
          roomName: room.roomName,
          tagX: room.tagX,
          tagY: room.tagY,
          levelId: drawingPage.levelId,
        })
      } else {
        await db.rooms.add({
          id: createId(),
          projectId: drawingPage.projectId,
          levelId: drawingPage.levelId,
          drawingPageId: drawingPage.id,
          roomNumber: room.roomNumber,
          roomName: room.roomName,
          tagX: room.tagX,
          tagY: room.tagY,
          templateId: null,
        })
      }
    }

    // Rum som inte längre hittas (t.ex. efter justerat rumsnummerformat) tas bort, men en ev.
    // ifylld inventeringspost för dem lämnas orörd i databasen istället för att raderas.
    for (const room of existing) {
      if (!detectedNumbers.has(room.roomNumber)) {
        await db.rooms.delete(room.id)
      }
    }
  })

  return detected.length
}
