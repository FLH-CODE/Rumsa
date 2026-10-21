import * as XLSX from 'xlsx'
import { db, type Project } from '../../db'

const HEADER = ['Nivå', 'Rum', 'Rumsnamn', 'Yta', 'Rivning', 'Målning/Sort/Kulör']

/**
 * Exporterar all inventeringsdata i projektet till en Excel-fil – en rad per ytskikt per rum,
 * sorterad per nivå (högst plan först) och rumsnummer. Laddas ner direkt i webbläsaren.
 */
export async function exportProjectToExcel(project: Project): Promise<void> {
  const [rooms, levels] = await Promise.all([
    db.rooms.where('projectId').equals(project.id).toArray(),
    db.levels.where('projectId').equals(project.id).toArray(),
  ])
  const levelById = new Map(levels.map((l) => [l.id, l]))

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

  const data: (string | number)[][] = [HEADER]

  for (const room of sortedRooms) {
    const levelName = room.levelId ? (levelById.get(room.levelId)?.name ?? '') : ''
    const record = recordByRoomId.get(room.id)
    const rows = record?.rows.filter((row) => row.surface.trim() || row.rivning.trim() || row.malningSortKulor.trim())

    if (!rows || rows.length === 0) {
      data.push([levelName, room.roomNumber, room.roomName, '', '', ''])
      continue
    }

    for (const row of rows) {
      data.push([levelName, room.roomNumber, room.roomName, row.surface, row.rivning, row.malningSortKulor])
    }
  }

  const worksheet = XLSX.utils.aoa_to_sheet(data)
  worksheet['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 40 }, { wch: 30 }]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventering')

  const dateStamp = new Date().toISOString().slice(0, 10)
  const safeName = project.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'Rumsa'
  XLSX.writeFile(workbook, `${safeName} – inventering ${dateStamp}.xlsx`)
}
