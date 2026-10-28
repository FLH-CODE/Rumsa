import { db, type Room, type RoomType } from '../../db'
import { ensureInventoryRecord } from './defaultTemplate'

/** Kopplar rummet till ett typrum – all rumskortets data visas därefter som typrummets, utan att
 * rummets egen (dolda) inventeringspost rörs. */
export async function linkRoomToType(room: Room, roomType: RoomType): Promise<void> {
  await db.rooms.update(room.id, { roomTypeId: roomType.id })
}

/** Frigör rummet från sitt typrum. Typrummets senaste data skrivs in i rummets egen
 * inventeringspost innan kopplingen tas bort, så att rummet fortsätter visa samma info istället
 * för att oväntat återgå till vad som fanns där innan det kopplades. */
export async function unlinkRoomFromType(room: Room, roomType: RoomType): Promise<void> {
  const record = await ensureInventoryRecord(room)
  await db.transaction('rw', db.rooms, db.inventoryRecords, async () => {
    await db.inventoryRecords.update(record.id, {
      categories: roomType.categories,
      antalPersoner: roomType.antalPersoner,
      funktionsbeskrivning: roomType.funktionsbeskrivning,
      dagsljus: roomType.dagsljus,
      storlek: roomType.storlek,
      updatedAt: Date.now(),
    })
    await db.rooms.update(room.id, { roomTypeId: null })
  })
}
