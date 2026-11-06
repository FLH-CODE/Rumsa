import type JSZip from 'jszip'
import {
  db,
  type Project,
  type Level,
  type Drawing,
  type DrawingPage,
  type Room,
  type InventoryRecord,
  type MaterialTag,
  type RoomType,
  type RoomPhoto,
  type TagPhoto,
} from '../../db'
import { deleteProjectCascade } from '../data/cascadeDelete'
import { confirmDialog } from '../../components/ConfirmDialog'
import { ProjectImportCancelledError } from './ProjectImportCancelledError'

function fileExtension(blob: Blob, fallback: string): string {
  if (blob.type === 'image/png') return 'png'
  if (blob.type === 'image/webp') return 'webp'
  if (blob.type === 'image/jpeg') return 'jpg'
  if (blob.type === 'application/pdf') return 'pdf'
  return fallback
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  pdf: 'application/pdf',
}

type ProjectBackupManifest = {
  exportedAt: string
  dbVersion: number
  project: Project
  levels: Level[]
  drawingPages: DrawingPage[]
  rooms: Room[]
  inventoryRecords: InventoryRecord[]
  materialTags: MaterialTag[]
  roomTypes: RoomType[]
  drawings: Array<Omit<Drawing, 'pdfBlob'> & { file: string }>
  roomPhotos: Array<Omit<RoomPhoto, 'blob'> & { file: string }>
  tagPhotos: Array<Omit<TagPhoto, 'blob'> & { file: string }>
}

/**
 * Exporterar ETT projekt (till skillnad från exportBackup.ts, som tar hela databasen) som en
 * nedladdningsbar zip – tänkt att flytta eller säkerhetskopiera ett enskilt projekt, t.ex. för att
 * fortsätta arbeta med det på en annan enhet (se importProjectBackup). Samma format (data.json +
 * egna filer för blobbar) som helhetsexporten, men med en enda `project` istället för en lista.
 */
export async function exportProjectBackup(projectId: string): Promise<void> {
  const { default: JSZip } = await import('jszip')
  const project = await db.projects.get(projectId)
  if (!project) throw new Error('Projektet hittades inte.')

  const [levels, drawings, drawingPages, rooms, materialTags, roomTypes] = await Promise.all([
    db.levels.where('projectId').equals(projectId).toArray(),
    db.drawings.where('projectId').equals(projectId).toArray(),
    db.drawingPages.where('projectId').equals(projectId).toArray(),
    db.rooms.where('projectId').equals(projectId).toArray(),
    db.materialTags.where('projectId').equals(projectId).toArray(),
    db.roomTypes.where('projectId').equals(projectId).toArray(),
  ])
  const roomIds = rooms.map((r) => r.id)
  const tagIds = materialTags.map((t) => t.id)
  const [inventoryRecords, roomPhotos, tagPhotos] = await Promise.all([
    db.inventoryRecords.where('roomId').anyOf(roomIds).toArray(),
    db.roomPhotos.where('roomId').anyOf(roomIds).toArray(),
    db.tagPhotos.where('tagId').anyOf(tagIds).toArray(),
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

  const manifest: ProjectBackupManifest = {
    exportedAt: new Date().toISOString(),
    dbVersion: db.verno,
    project,
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
  zip.file('data.json', JSON.stringify(manifest))

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${project.name} – Rumsa-projekt ${new Date().toISOString().slice(0, 10)}.zip`
  link.click()
  URL.revokeObjectURL(url)
}

/** JSZip returnerar blobben utan rätt MIME-typ (bara rådata) – sätter den tillbaka utifrån filens
 * eget filändelse (satt vid export, se fileExtension ovan) så en återimporterad bild/PDF har exakt
 * samma typ som innan den exporterades, inte bara samma bytes. */
async function readBlobFromZip(zip: JSZip, path: string): Promise<Blob> {
  const entry = zip.file(path)
  if (!entry) throw new Error(`Filen ${path} saknas i exporten.`)
  const raw = await entry.async('blob')
  const extension = path.split('.').pop() ?? ''
  const mimeType = MIME_BY_EXTENSION[extension]
  return mimeType ? new Blob([raw], { type: mimeType }) : raw
}

/**
 * Läser in en zip från exportProjectBackup och skriver in projektet (med alla ursprungliga id:n
 * bevarade) i den lokala databasen – gör det möjligt att flytta ett projekt till en annan enhet
 * genom att exportera på den ena och importera här på den andra. Finns redan ett projekt med
 * samma id (t.ex. vid en förnyad import av samma projekt) frågar den om det ska skrivas över
 * istället för att tyst skapa en duplett eller krascha på en id-krock.
 */
export async function importProjectBackup(file: File): Promise<string> {
  const { default: JSZip } = await import('jszip')
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new Error('Filen kunde inte läsas som en zip-fil.')
  }

  const dataFile = zip.file('data.json')
  if (!dataFile) throw new Error('Filen innehåller ingen data.json – verkar inte vara en Rumsa-projektexport.')

  let manifest: ProjectBackupManifest
  try {
    manifest = JSON.parse(await dataFile.async('string')) as ProjectBackupManifest
  } catch {
    throw new Error('data.json i filen kunde inte tolkas.')
  }
  if (!manifest.project?.id) {
    throw new Error('Filen saknar projektdata – verkar inte vara en giltig Rumsa-projektexport.')
  }

  const existing = await db.projects.get(manifest.project.id)
  if (existing) {
    const overwrite = await confirmDialog(
      `Projektet "${existing.name}" finns redan på den här enheten. Skriv över det med den importerade versionen? Detta går inte att ångra.`,
      { danger: true, confirmLabel: 'Skriv över' },
    )
    if (!overwrite) throw new ProjectImportCancelledError('Avbrutet av användaren.')
    await deleteProjectCascade(existing.id)
  }

  const drawings: Drawing[] = await Promise.all(
    manifest.drawings.map(async ({ file: path, ...rest }) => ({ ...rest, pdfBlob: await readBlobFromZip(zip, path) })),
  )
  const roomPhotos: RoomPhoto[] = await Promise.all(
    manifest.roomPhotos.map(async ({ file: path, ...rest }) => ({ ...rest, blob: await readBlobFromZip(zip, path) })),
  )
  const tagPhotos: TagPhoto[] = await Promise.all(
    manifest.tagPhotos.map(async ({ file: path, ...rest }) => ({ ...rest, blob: await readBlobFromZip(zip, path) })),
  )

  await db.transaction(
    'rw',
    [
      db.projects,
      db.levels,
      db.drawings,
      db.drawingPages,
      db.rooms,
      db.inventoryRecords,
      db.materialTags,
      db.roomTypes,
      db.roomPhotos,
      db.tagPhotos,
    ],
    async () => {
      await db.projects.add(manifest.project)
      if (manifest.levels.length) await db.levels.bulkAdd(manifest.levels)
      if (drawings.length) await db.drawings.bulkAdd(drawings)
      if (manifest.drawingPages.length) await db.drawingPages.bulkAdd(manifest.drawingPages)
      if (manifest.rooms.length) await db.rooms.bulkAdd(manifest.rooms)
      if (manifest.inventoryRecords.length) await db.inventoryRecords.bulkAdd(manifest.inventoryRecords)
      if (manifest.materialTags.length) await db.materialTags.bulkAdd(manifest.materialTags)
      if (manifest.roomTypes.length) await db.roomTypes.bulkAdd(manifest.roomTypes)
      if (roomPhotos.length) await db.roomPhotos.bulkAdd(roomPhotos)
      if (tagPhotos.length) await db.tagPhotos.bulkAdd(tagPhotos)
    },
  )

  return manifest.project.id
}
