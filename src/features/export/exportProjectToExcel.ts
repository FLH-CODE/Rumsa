import * as XLSX from 'xlsx'
import { db, type InventoryRow, type MaterialTag, type Project } from '../../db'

const YTSKIKT_HEADER = ['Nivå', 'Rum', 'Rumsnamn', 'Antal personer', 'Funktionsbeskrivning', 'Yta', 'Rivning', 'Material', 'Övrigt']
const UTRUSTNING_HEADER = ['Nivå', 'Rum', 'Rumsnamn', 'Namn', 'Utrustning', 'Övrigt']

/**
 * Exporterar all inventeringsdata i projektet till en Excel-fil – en rad per ytskikt per rum i
 * huvudfliken, en motsvarande flik för Utrustning, sorterat per nivå (högst plan först) och
 * rumsnummer. Laddas ner direkt i webbläsaren.
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

  const ytskiktData: (string | number)[][] = [YTSKIKT_HEADER]
  const utrustningData: (string | number)[][] = [UTRUSTNING_HEADER]

  for (const room of sortedRooms) {
    const levelName = room.levelId ? (levelById.get(room.levelId)?.name ?? '') : ''
    const record = recordByRoomId.get(room.id)

    const ytskiktRows = record?.rows.filter(
      (row) => row.surface.trim() || row.rivning.trim() || row.materials.length > 0 || row.ovrigt.trim(),
    )
    if (!ytskiktRows || ytskiktRows.length === 0) {
      ytskiktData.push([
        levelName,
        room.roomNumber,
        room.roomName,
        record?.antalPersoner ?? '',
        record?.funktionsbeskrivning ?? '',
        '',
        '',
        '',
        '',
      ])
    } else {
      for (const row of ytskiktRows) {
        ytskiktData.push([
          levelName,
          room.roomNumber,
          room.roomName,
          record?.antalPersoner ?? '',
          record?.funktionsbeskrivning ?? '',
          row.surface,
          row.rivning,
          formatTags(row),
          row.ovrigt,
        ])
      }
    }

    const equipmentRows = record?.equipmentRows.filter(
      (row) => row.surface.trim() || row.materials.length > 0 || row.ovrigt.trim(),
    )
    for (const row of equipmentRows ?? []) {
      utrustningData.push([levelName, room.roomNumber, room.roomName, row.surface, formatTags(row), row.ovrigt])
    }
  }

  const workbook = XLSX.utils.book_new()

  const ytskiktSheet = XLSX.utils.aoa_to_sheet(ytskiktData)
  ytskiktSheet['!cols'] = [
    { wch: 10 },
    { wch: 10 },
    { wch: 20 },
    { wch: 12 },
    { wch: 30 },
    { wch: 12 },
    { wch: 40 },
    { wch: 40 },
    { wch: 40 },
  ]
  XLSX.utils.book_append_sheet(workbook, ytskiktSheet, 'Ytskikt')

  if (utrustningData.length > 1) {
    const utrustningSheet = XLSX.utils.aoa_to_sheet(utrustningData)
    utrustningSheet['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 40 }, { wch: 40 }]
    XLSX.utils.book_append_sheet(workbook, utrustningSheet, 'Utrustning')
  }

  const legendSheet = (kind: MaterialTag['kind'], sheetName: string) => {
    const kindTags = tags.filter((t) => t.kind === kind)
    if (kindTags.length === 0) return
    const legendData: (string | number)[][] = [
      ['Kod', 'Beskrivning'],
      ...kindTags.sort((a, b) => a.code.localeCompare(b.code, 'sv')).map((t) => [t.code, t.description]),
    ]
    const sheet = XLSX.utils.aoa_to_sheet(legendData)
    sheet['!cols'] = [{ wch: 16 }, { wch: 50 }]
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName)
  }
  legendSheet('material', 'Materialtaggar')
  legendSheet('equipment', 'Utrustningstaggar')

  const dateStamp = new Date().toISOString().slice(0, 10)
  const safeName = project.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'Rumsa'
  XLSX.writeFile(workbook, `${safeName} – inventering ${dateStamp}.xlsx`)
}
