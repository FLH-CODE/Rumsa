import { db, createId, type InventoryRecord, type Room, type RoomType } from '../../db'
import { ensureInventoryRecord } from './defaultTemplate'

/** Kopplar rummet till ett typrum – all rumskortets data visas därefter som typrummets, utan att
 * rummets egen (dolda) inventeringspost rörs. */
export async function linkRoomToType(room: Room, roomType: RoomType): Promise<void> {
  await db.rooms.update(room.id, { roomTypeId: roomType.id })
}

function roomTypeDataPatch(roomType: RoomType): Pick<
  InventoryRecord,
  'categories' | 'antalPersoner' | 'funktionsbeskrivning' | 'dagsljus' | 'storlek' | 'updatedAt'
> {
  return {
    categories: roomType.categories,
    antalPersoner: roomType.antalPersoner,
    funktionsbeskrivning: roomType.funktionsbeskrivning,
    dagsljus: roomType.dagsljus,
    storlek: roomType.storlek,
    updatedAt: Date.now(),
  }
}

/** Frigör rummet från sitt typrum. Typrummets senaste data skrivs in i rummets egen
 * inventeringspost innan kopplingen tas bort, så att rummet fortsätter visa samma info istället
 * för att oväntat återgå till vad som fanns där innan det kopplades. */
export async function unlinkRoomFromType(room: Room, roomType: RoomType): Promise<void> {
  const record = await ensureInventoryRecord(room)
  await db.transaction('rw', db.rooms, db.inventoryRecords, async () => {
    await db.inventoryRecords.update(record.id, roomTypeDataPatch(roomType))
    await db.rooms.update(room.id, { roomTypeId: null })
  })
}

/** Kopierar typrummets data in i rummets egen inventeringspost EN gång, utan att koppla rummet
 * till typrummet – till skillnad från linkRoomToType blir det alltså ingen stående koppling: rummet
 * förblir fristående och kan avvika direkt efteråt, och ärver inga senare ändringar i typrummet. */
export async function applyRoomTypeDataOnce(room: Room, roomType: RoomType): Promise<void> {
  const record = await ensureInventoryRecord(room)
  await db.inventoryRecords.update(record.id, roomTypeDataPatch(roomType))
}

/** Hittar nästa lediga namn för ett typrum skapat utifrån ett rum – "<rumsnamn> (typrum)" i
 * första hand, annars "Typrum från rum <nummer>", med en löpande siffra om namnet redan finns. */
async function generateRoomTypeNameFromRoom(room: Room): Promise<string> {
  const base = room.roomName.trim() ? `${room.roomName.trim()} (typrum)` : `Typrum från rum ${room.roomNumber}`
  const existingNames = new Set((await db.roomTypes.where('projectId').equals(room.projectId).toArray()).map((t) => t.name))
  if (!existingNames.has(base)) return base
  let n = 2
  while (existingNames.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

/** Skapar ett nytt typrum i projektets bibliotek utifrån rummets NUVARANDE egna data – en
 * engångskopia, inte en koppling (rummet blir alltså inte automatiskt kopplat till det nya
 * typrummet; vill man det görs det separat via linkRoomToType). */
export async function createRoomTypeFromRoom(room: Room): Promise<RoomType> {
  const [record, name] = await Promise.all([ensureInventoryRecord(room), generateRoomTypeNameFromRoom(room)])
  const roomType: RoomType = {
    id: createId(),
    projectId: room.projectId,
    name,
    categories: record.categories,
    antalPersoner: record.antalPersoner,
    funktionsbeskrivning: record.funktionsbeskrivning,
    dagsljus: record.dagsljus,
    storlek: record.storlek,
    updatedAt: Date.now(),
  }
  await db.roomTypes.add(roomType)
  return roomType
}
