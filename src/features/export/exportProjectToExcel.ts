import * as XLSX from 'xlsx'
import { db, ROOM_CATEGORIES, type InventoryRow, type Project } from '../../db'
import { CATEGORY_LABEL } from '../inventory/categories'

const HEADER = ['Nivå', 'Rum', 'Rumsnamn', 'Antal personer', 'Funktionsbeskrivning', 'Kategori', 'Namn', 'Rivning', 'Material', 'Övrigt']
const LEGEND_HEADER = ['Kategori', 'Kod', 'Beskrivning']

/**
 * Exporterar all inventeringsdata i projektet till en Excel-fil – en rad per inventeringspost per
 * rum i huvudfliken (med en Kategori-kolumn, eftersom Golv/Vägg/Tak/Övrigt/Utrustning nu är en
 * fast indelning snarare än separata flikar), sorterat per nivå (högst plan först) och
 * rumsnummer, plus en taggförteckning. Laddas ner direkt i webbläsaren.
 */
export async function exportProjectToExcel(project: Project): Promise<void> {
  const [rooms, levels, tags] = await Promise.all([
    db.rooms.where('projectId').equals(project.id).toArray(),
    db.levels.where('projectId').equals(project.id).toArray(),
    db.materialTags.where('projectId').equals(project.id).toArray(),
  ])
  const levelById = new Map(levels.map((l) => [l.id, l]))
  const tagById = new Map(tags.map((t) => [t.id, t]))

  const records = await db.inventoryRecords
    .where('roomId')
    .anyOf(rooms.map((r) => r.id))
    .toArray()
  const recordByRoomId = new Map(records.map((r) => [r.roomId, r]))

  const sortedRooms = [...rooms].sort((a, b) => {
    const orderA = a.levelId ? (levelById.get(a.levelId)?.order ?? Infinity) : Infinity
    const orderB = b.levelId ? (levelById.get(b.levelId)?.order ?? Infinity) : Infinity
    if (orderA !== orderB) return orderB - orderA
    // Två nivåer kan dela samma `order` (t.ex. flera manuellt namngivna utan siffra i namnet) –
    // utan den här tie-breaken skulle deras rum blandas ihop istället för att grupperas.
    if (a.levelId !== b.levelId) return (a.levelId ?? '').localeCompare(b.levelId ?? '')
    return a.roomNumber.localeCompare(b.roomNumber, 'sv', { numeric: true })
  })

  const formatTags = (row: Pick<InventoryRow, 'materials'>) =>
    row.materials
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
    const record = recordByRoomId.get(room.id)

    const items = record?.items.filter(
      (item) => item.surface.trim() || item.rivning.trim() || item.materials.length > 0 || item.ovrigt.trim(),
    )
    if (!items || items.length === 0) {
      data.push([levelName, room.roomNumber, room.roomName, record?.antalPersoner ?? '', record?.funktionsbeskrivning ?? '', '', '', '', '', ''])
    } else {
      for (const item of items) {
        data.push([
          levelName,
          room.roomNumber,
          room.roomName,
          record?.antalPersoner ?? '',
          record?.funktionsbeskrivning ?? '',
          CATEGORY_LABEL[item.category],
          item.surface,
          item.rivning,
          formatTags(item),
          item.ovrigt,
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
    { wch: 20 },
    { wch: 40 },
    { wch: 40 },
    { wch: 40 },
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
  XLSX.writeFile(workbook, `${safeName} – inventering ${dateStamp}.xlsx`)
}
