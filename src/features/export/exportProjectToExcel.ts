import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { db, ROOM_CATEGORIES, type CategoryEntry, type Project, type Room, type RoomPhoto } from '../../db'
import { CATEGORY_LABEL } from '../inventory/categories'

const HEADER = [
  'Nivå',
  'Rum',
  'Rumsnamn',
  'Antal personer',
  'Funktionsbeskrivning',
  'Dagsljus',
  'Storlek',
  'Kategori',
  'Material',
  'Övrigt',
  'Bilder',
]
const LEGEND_HEADER = ['Kategori', 'Kod', 'Beskrivning']

/** Ett filsystemsäkert namn för rummets bildmapp i zip-exporten, t.ex. "1015 SLUSS". */
function roomFolderName(room: Room): string {
  const label = `${room.roomNumber}${room.roomName ? ` ${room.roomName}` : ''}`.replace(/[\\/:*?"<>|]/g, '').trim()
  return label || room.id
}

function photoExtension(blob: Blob): string {
  if (blob.type === 'image/png') return 'png'
  if (blob.type === 'image/webp') return 'webp'
  return 'jpg'
}

/**
 * Exporterar all inventeringsdata i projektet till en Excel-fil – en rad per kategori med
 * innehåll per rum i huvudfliken (Kategori-kolumn, eftersom Golv/Vägg/Tak/Övrigt/Utrustning är
 * en fast indelning snarare än separata flikar), sorterat per nivå (högst plan först) och
 * rumsnummer, plus en taggförteckning. Laddas ner direkt i webbläsaren.
 */
export async function exportProjectToExcel(project: Project): Promise<void> {
  const [rooms, levels, tags, roomTypes] = await Promise.all([
    db.rooms.where('projectId').equals(project.id).toArray(),
    db.levels.where('projectId').equals(project.id).toArray(),
    db.materialTags.where('projectId').equals(project.id).toArray(),
    db.roomTypes.where('projectId').equals(project.id).toArray(),
  ])
  const levelById = new Map(levels.map((l) => [l.id, l]))
  const tagById = new Map(tags.map((t) => [t.id, t]))
  const roomTypeById = new Map(roomTypes.map((t) => [t.id, t]))

  const records = await db.inventoryRecords
    .where('roomId')
    .anyOf(rooms.map((r) => r.id))
    .toArray()
  const recordByRoomId = new Map(records.map((r) => [r.roomId, r]))

  const photos = await db.roomPhotos.where('roomId').anyOf(rooms.map((r) => r.id)).toArray()
  const photosByRoomId = new Map<string, RoomPhoto[]>()
  for (const photo of photos) {
    const list = photosByRoomId.get(photo.roomId)
    if (list) list.push(photo)
    else photosByRoomId.set(photo.roomId, [photo])
  }

  // Ett rum kopplat till ett typrum exporterar typrummets data (vad kortet faktiskt visar),
  // inte rummets egen – ofyllda eller matchande – bakgrundspost.
  type EffectiveData = Pick<
    import('../../db').InventoryRecord,
    'categories' | 'antalPersoner' | 'funktionsbeskrivning' | 'dagsljus' | 'storlek'
  >
  const effectiveDataForRoom = (room: (typeof rooms)[number]): EffectiveData | undefined => {
    if (room.roomTypeId) return roomTypeById.get(room.roomTypeId)
    return recordByRoomId.get(room.id)
  }

  const sortedRooms = [...rooms].sort((a, b) => {
    const orderA = a.levelId ? (levelById.get(a.levelId)?.order ?? Infinity) : Infinity
    const orderB = b.levelId ? (levelById.get(b.levelId)?.order ?? Infinity) : Infinity
    if (orderA !== orderB) return orderB - orderA
    // Två nivåer kan dela samma `order` (t.ex. flera manuellt namngivna utan siffra i namnet) –
    // utan den här tie-breaken skulle deras rum blandas ihop istället för att grupperas.
    if (a.levelId !== b.levelId) return (a.levelId ?? '').localeCompare(b.levelId ?? '')
    return a.roomNumber.localeCompare(b.roomNumber, 'sv', { numeric: true })
  })

  const formatMaterials = (entry: Pick<CategoryEntry, 'materials'>) =>
    entry.materials
      .map((m) => {
        // `?? 'Okänd tagg'` ensam missar en tagg som finns men har tom kod (t.ex. gammal
        // testdata) – det gav tidigare ett helt namnlöst material i exporten.
        const code = tagById.get(m.tagId)?.code?.trim() || 'Okänd tagg'
        return m.note ? `${code} (${m.note})` : code
      })
      .join('; ')

  const data: (string | number)[][] = [HEADER]

  for (const room of sortedRooms) {
    const levelName = room.levelId ? (levelById.get(room.levelId)?.name ?? '') : ''
    const record = effectiveDataForRoom(room)
    const roomPhotoCount = photosByRoomId.get(room.id)?.length ?? 0
    // Hänvisar till zip-exportens mapp (se roomFolderName) istället för att försöka bädda in
    // bilderna i själva kalkylarket – xlsx-biblioteket som används saknar stöd för det.
    const photoLabel = roomPhotoCount > 0 ? `${roomPhotoCount} st (Bilder/${roomFolderName(room)})` : ''

    const categoriesWithContent = record
      ? ROOM_CATEGORIES.filter((c) => record.categories[c].materials.length > 0 || record.categories[c].ovrigt.trim())
      : []

    if (categoriesWithContent.length === 0) {
      data.push([
        levelName,
        room.roomNumber,
        room.roomName,
        record?.antalPersoner ?? '',
        record?.funktionsbeskrivning ?? '',
        record?.dagsljus ?? '',
        record?.storlek ?? '',
        '',
        '',
        '',
        photoLabel,
      ])
    } else {
      for (const category of categoriesWithContent) {
        const entry = record!.categories[category]
        data.push([
          levelName,
          room.roomNumber,
          room.roomName,
          record?.antalPersoner ?? '',
          record?.funktionsbeskrivning ?? '',
          record?.dagsljus ?? '',
          record?.storlek ?? '',
          CATEGORY_LABEL[category],
          formatMaterials(entry),
          entry.ovrigt,
          photoLabel,
        ])
      }
    }
  }

  const workbook = XLSX.utils.book_new()

  const sheet = XLSX.utils.aoa_to_sheet(data)
  sheet['!cols'] = [
    { wch: 10 },
    { wch: 10 },
    { wch: 20 },
    { wch: 12 },
    { wch: 30 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 40 },
    { wch: 40 },
    { wch: 30 },
  ]
  XLSX.utils.book_append_sheet(workbook, sheet, 'Inventering')

  const legendData: (string | number)[][] = [LEGEND_HEADER]
  for (const category of ROOM_CATEGORIES) {
    const categoryTags = tags.filter((t) => t.category === category).sort((a, b) => a.code.localeCompare(b.code, 'sv'))
    for (const tag of categoryTags) {
      legendData.push([CATEGORY_LABEL[category], tag.code, tag.description])
    }
  }
  if (legendData.length > 1) {
    const legendSheet = XLSX.utils.aoa_to_sheet(legendData)
    legendSheet['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 50 }]
    XLSX.utils.book_append_sheet(workbook, legendSheet, 'Taggar')
  }

  const dateStamp = new Date().toISOString().slice(0, 10)
  const safeName = project.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'Rumsa'
  const xlsxFileName = `${safeName} – inventering ${dateStamp}.xlsx`

  if (photos.length === 0) {
    XLSX.writeFile(workbook, xlsxFileName)
    return
  }

  // Finns det bilder exporteras allt tillsammans som en zip (kalkylarket + en bildmapp per rum) –
  // xlsx-biblioteket kan inte bädda in bilderna i själva arket, så en separat nedladdning per bild
  // (eller att bara tappa bort dem helt) hade varit mycket sämre.
  const zip = new JSZip()
  const xlsxContent = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  zip.file(xlsxFileName, xlsxContent)
  for (const room of sortedRooms) {
    const roomPhotos = photosByRoomId.get(room.id)
    if (!roomPhotos || roomPhotos.length === 0) continue
    const folder = `Bilder/${roomFolderName(room)}`
    roomPhotos.forEach((photo, index) => {
      zip.file(`${folder}/bild-${index + 1}.${photoExtension(photo.blob)}`, photo.blob)
    })
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${safeName} – inventering ${dateStamp}.zip`
  link.click()
  URL.revokeObjectURL(url)
}
