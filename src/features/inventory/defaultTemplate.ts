import { db, createId, type InventoryRecord, type InventoryRow, type Room, type RoomCategory } from '../../db'

/** Standardrader för ett nytt rum – en tom rad per vanlig ytskiktskategori, så man slipper lägga
 * till dem själv för varje nytt rum. Utrustning/Övrigt börjar tomma – de läggs till vid behov. */
const DEFAULT_ITEM_CATEGORIES: { category: RoomCategory; surface: string }[] = [
  { category: 'golv', surface: 'Golv' },
  { category: 'vagg', surface: 'Vägg' },
  { category: 'tak', surface: 'Tak' },
]

function defaultItems(): InventoryRow[] {
  return DEFAULT_ITEM_CATEGORIES.map(({ category, surface }) => ({
    id: createId(),
    category,
    surface,
    rivning: '',
    materials: [],
    ovrigt: '',
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
      items: defaultItems(),
      antalPersoner: '',
      funktionsbeskrivning: '',
      updatedAt: Date.now(),
    }
    await db.inventoryRecords.add(record)
    return record
  })
}
