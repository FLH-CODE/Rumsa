import { db, createId, ROOM_CATEGORIES, type CategoryEntry, type InventoryRecord, type Room, type RoomCategory } from '../../db'

function emptyCategories(): Record<RoomCategory, CategoryEntry> {
  return Object.fromEntries(ROOM_CATEGORIES.map((category) => [category, { materials: [], ovrigt: '' }])) as unknown as Record<
    RoomCategory,
    CategoryEntry
  >
}

/**
 * Hämtar rummets inventeringspost, eller skapar en ny om rummet öppnas första gången. Körs i en
 * readwrite-transaktion så att två samtidiga anrop (t.ex. Reacts StrictMode-dubbelkörning i
 * dev-läge) inte kan skapa varsin post för samma rum.
 */
export async function ensureInventoryRecord(room: Room): Promise<InventoryRecord> {
  return db.transaction('rw', db.inventoryRecords, async () => {
    const existing = await db.inventoryRecords.where('roomId').equals(room.id).first()
    if (existing) return existing

    const record: InventoryRecord = {
      id: createId(),
      roomId: room.id,
      categories: emptyCategories(),
      antalPersoner: '',
      funktionsbeskrivning: '',
      dagsljus: '',
      storlek: '',
      updatedAt: Date.now(),
    }
    await db.inventoryRecords.add(record)
    return record
  })
}
