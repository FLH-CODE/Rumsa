import { db, createId, type InventoryRecord, type Room } from '../../db'

/** Standardrader för ett nytt rum – matchar de vanligaste ytskikten (golv/sockel/vägg/tak). */
export const DEFAULT_SURFACES = ['Golv', 'Sockel', 'Vägg', 'Tak']

function emptyRows() {
  return DEFAULT_SURFACES.map((surface) => ({
    id: createId(),
    surface,
    rivning: '',
    malningSortKulor: '',
  }))
}

/**
 * Hämtar rummets inventeringspost, eller skapar en ny med standardrader om rummet öppnas första
 * gången. Körs i en readwrite-transaktion så att två samtidiga anrop (t.ex. Reacts StrictMode-
 * dubbelkörning i dev-läge) inte kan skapa varsin post för samma rum.
 */
export async function ensureInventoryRecord(room: Room): Promise<InventoryRecord> {
  return db.transaction('rw', db.inventoryRecords, async () => {
    const existing = await db.inventoryRecords.where('roomId').equals(room.id).first()
    if (existing) return existing

    const record: InventoryRecord = {
      id: createId(),
      roomId: room.id,
      rows: emptyRows(),
      updatedAt: Date.now(),
    }
    await db.inventoryRecords.add(record)
    return record
  })
}
