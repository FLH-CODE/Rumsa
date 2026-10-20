import type { PDFPageProxy } from 'pdfjs-dist'
import { db, createId, type DrawingPage } from '../../db'
import { detectRooms } from './detectRooms'

/**
 * Kör rumstaggdetektering för en sida och skriver om Room-posterna för just den sidan.
 * Används både vid import och när användaren manuellt vill detektera om (t.ex. efter att
 * ha justerat projektets rumsnummerformat).
 */
export async function syncRoomsForPage(
  page: PDFPageProxy,
  drawingPage: Pick<DrawingPage, 'id' | 'projectId' | 'levelId'>,
  roomNumberPatternSource: string,
): Promise<number> {
  const pattern = new RegExp(roomNumberPatternSource)
  const detected = await detectRooms(page, pattern)

  await db.rooms.where('drawingPageId').equals(drawingPage.id).delete()

  if (detected.length === 0) return 0

  await db.rooms.bulkAdd(
    detected.map((room) => ({
      id: createId(),
      projectId: drawingPage.projectId,
      levelId: drawingPage.levelId,
      drawingPageId: drawingPage.id,
      roomNumber: room.roomNumber,
      roomName: room.roomName,
      tagX: room.tagX,
      tagY: room.tagY,
      templateId: null,
    })),
  )

  return detected.length
}
