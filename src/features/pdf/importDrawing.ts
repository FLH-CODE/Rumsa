import { pdfjsLib } from '../../pdf/pdfjsSetup'
import { db, createId, type DrawingPage, type Level } from '../../db'
import { detectLevelLabel } from './detectLevelLabel'
import { renderThumbnail } from './renderThumbnail'
import { syncRoomsForPage } from './syncRooms'

/**
 * Läser in en PDF (enkel sida eller buntad), skapar en Drawing + en DrawingPage per sida,
 * och kopplar varje sida till en nivå – antingen en som redan finns i projektet eller en ny
 * som skapas utifrån den avlästa "PLAN XX"-etiketten. Sidor utan igenkänd etikett får ingen
 * nivå och kan tilldelas manuellt i ritningsvisaren.
 */
export async function importDrawingFile(projectId: string, file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const pdfBlob = new Blob([buffer], { type: 'application/pdf' })

  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise

  const drawingId = createId()
  await db.drawings.add({
    id: drawingId,
    projectId,
    fileName: file.name,
    pdfBlob,
    pageCount: pdf.numPages,
    uploadedAt: Date.now(),
  })

  const project = await db.projects.get(projectId)
  const roomNumberPattern = project?.roomNumberPattern ?? '^\\d{3,4}$'

  const existingLevels = await db.levels.where('projectId').equals(projectId).toArray()
  const levelByName = new Map(existingLevels.map((level) => [level.name, level]))

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const [levelLabel, thumbnailDataUrl] = await Promise.all([
      detectLevelLabel(page),
      renderThumbnail(page),
    ])

    const levelId = levelLabel ? await resolveLevel(projectId, levelLabel, levelByName) : null

    const drawingPage: DrawingPage = {
      id: createId(),
      drawingId,
      projectId,
      pageIndex: pageNumber - 1,
      levelId,
      thumbnailDataUrl,
    }
    await db.drawingPages.add(drawingPage)
    await syncRoomsForPage(page, drawingPage, roomNumberPattern)
  }

  return drawingId
}

async function resolveLevel(
  projectId: string,
  levelLabel: string,
  levelByName: Map<string, Level>,
): Promise<string> {
  const existing = levelByName.get(levelLabel)
  if (existing) return existing.id

  const numericMatch = levelLabel.match(/\d+/)
  const level: Level = {
    id: createId(),
    projectId,
    name: levelLabel,
    order: numericMatch ? parseInt(numericMatch[0], 10) : levelByName.size,
  }
  await db.levels.add(level)
  levelByName.set(levelLabel, level)
  return level.id
}
