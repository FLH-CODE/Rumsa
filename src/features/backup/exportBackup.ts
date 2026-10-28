import JSZip from 'jszip'
import { db } from '../../db'

function fileExtension(blob: Blob, fallback: string): string {
  if (blob.type === 'image/png') return 'png'
  if (blob.type === 'image/webp') return 'webp'
  if (blob.type === 'image/jpeg') return 'jpg'
  if (blob.type === 'application/pdf') return 'pdf'
  return fallback
}

/**
 * Exporterar ALL data i appen (alla projekt, inte bara ett) som en nedladdningsbar zip – en
 * säkerhetskopia som finns kvar oberoende av vad som händer med appen eller enhetens lagring.
 * Innehåller en `data.json` med alla poster (utom själva bildfilerna/PDF:erna, som refereras via
 * relativa sökvägar i filen) plus de faktiska fil-blobbarna i egna mappar.
 *
 * Exporterar bara – läser inte tillbaka in data i appen. Filerna är ändå läsbara/öppningsbara för
 * sig (PDF:er och bilder går att öppna direkt, data.json är vanlig, läsbar JSON), så informationen
 * är inte låst inne i appen även om appen i sig skulle sluta fungera.
 */
export async function exportBackup(): Promise<void> {
  const [
    projects,
    levels,
    drawings,
    drawingPages,
    rooms,
    inventoryRecords,
    materialTags,
    roomTypes,
    roomPhotos,
    tagPhotos,
  ] = await Promise.all([
    db.projects.toArray(),
    db.levels.toArray(),
    db.drawings.toArray(),
    db.drawingPages.toArray(),
    db.rooms.toArray(),
    db.inventoryRecords.toArray(),
    db.materialTags.toArray(),
    db.roomTypes.toArray(),
    db.roomPhotos.toArray(),
    db.tagPhotos.toArray(),
  ])

  const zip = new JSZip()

  const drawingsMeta = drawings.map(({ pdfBlob, ...rest }) => {
    const file = `drawings/${rest.id}.${fileExtension(pdfBlob, 'pdf')}`
    zip.file(file, pdfBlob)
    return { ...rest, file }
  })
  const roomPhotosMeta = roomPhotos.map(({ blob, ...rest }) => {
    const file = `roomPhotos/${rest.id}.${fileExtension(blob, 'jpg')}`
    zip.file(file, blob)
    return { ...rest, file }
  })
  const tagPhotosMeta = tagPhotos.map(({ blob, ...rest }) => {
    const file = `tagPhotos/${rest.id}.${fileExtension(blob, 'jpg')}`
    zip.file(file, blob)
    return { ...rest, file }
  })

  const manifest = {
    exportedAt: new Date().toISOString(),
    dbVersion: db.verno,
    projects,
    levels,
    drawingPages,
    rooms,
    inventoryRecords,
    materialTags,
    roomTypes,
    drawings: drawingsMeta,
    roomPhotos: roomPhotosMeta,
    tagPhotos: tagPhotosMeta,
  }
  zip.file('data.json', JSON.stringify(manifest, null, 2))

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = `Rumsa säkerhetskopia ${new Date().toISOString().slice(0, 10)}.zip`
  link.click()
  URL.revokeObjectURL(url)
}
