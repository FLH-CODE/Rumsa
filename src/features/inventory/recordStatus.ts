import type { InventoryRecord, InventoryRow } from '../../db'

function hasRowContent(row: InventoryRow): boolean {
  return Boolean(row.rivning.trim() || row.materials.length > 0 || row.ovrigt.trim())
}

/** Om rummet har någon ifylld data alls – i någon kategori, eller i Funktion-fälten – används för
 * "klar"-indikeringen på rumstaggar och projektets framstegsmätare. */
export function isRecordStarted(record: InventoryRecord): boolean {
  return (
    record.items.some(hasRowContent) ||
    Boolean(record.antalPersoner.trim()) ||
    Boolean(record.funktionsbeskrivning.trim())
  )
}
