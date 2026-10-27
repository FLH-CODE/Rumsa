import type { InventoryRecord } from '../../db'

/** Om rummet har någon ifylld data alls – i någon kategori, eller i Funktion-fälten – används för
 * "klar"-indikeringen på rumstaggar och projektets framstegsmätare. */
export function isRecordStarted(record: InventoryRecord): boolean {
  return (
    Object.values(record.categories).some((entry) => entry.materials.length > 0 || entry.ovrigt.trim()) ||
    Boolean(record.antalPersoner.trim()) ||
    Boolean(record.funktionsbeskrivning.trim())
  )
}
