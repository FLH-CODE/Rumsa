import { db, type InventoryRecord, type RoomType } from '../../db'

/**
 * Tar bort ett helt projekt och allt som hör till det – ritningar (inkl. PDF-blobbar), sidor,
 * rum och inventeringar. Utan kaskaden skulle borttagning av projektet bara dölja datan, inte
 * städa bort den, vilket sakta fyller upp lagringsutrymmet.
 */
export async function deleteProjectCascade(projectId: string): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.projects,
      db.levels,
      db.drawings,
      db.drawingPages,
      db.rooms,
      db.inventoryRecords,
      db.materialTags,
      db.roomTypes,
      db.roomPhotos,
      db.tagPhotos,
    ],
    async () => {
      const rooms = await db.rooms.where('projectId').equals(projectId).toArray()
      const roomIds = rooms.map((r) => r.id)
      const tags = await db.materialTags.where('projectId').equals(projectId).toArray()
      await db.inventoryRecords.where('roomId').anyOf(roomIds).delete()
      await db.roomPhotos.where('roomId').anyOf(roomIds).delete()
      await db.tagPhotos.where('tagId').anyOf(tags.map((t) => t.id)).delete()
      await Promise.all([
        db.rooms.where('projectId').equals(projectId).delete(),
        db.drawingPages.where('projectId').equals(projectId).delete(),
        db.drawings.where('projectId').equals(projectId).delete(),
        db.levels.where('projectId').equals(projectId).delete(),
        db.materialTags.where('projectId').equals(projectId).delete(),
        db.roomTypes.where('projectId').equals(projectId).delete(),
      ])
      await db.projects.delete(projectId)
    },
  )
}

/**
 * Tar bort en enskild ritning (PDF) och allt som bara hör till den – dess sidor och de rum som
 * upptäckts på just de sidorna, inklusive deras inventering.
 */
export async function deleteDrawingCascade(drawingId: string): Promise<void> {
  await db.transaction('rw', [db.drawings, db.drawingPages, db.rooms, db.inventoryRecords, db.roomPhotos], async () => {
    const pages = await db.drawingPages.where('drawingId').equals(drawingId).toArray()
    const pageIds = pages.map((p) => p.id)
    const rooms = await db.rooms.where('drawingPageId').anyOf(pageIds).toArray()
    const roomIds = rooms.map((r) => r.id)
    await db.inventoryRecords.where('roomId').anyOf(roomIds).delete()
    await db.roomPhotos.where('roomId').anyOf(roomIds).delete()
    await db.rooms.where('drawingPageId').anyOf(pageIds).delete()
    await db.drawingPages.where('drawingId').equals(drawingId).delete()
    await db.drawings.delete(drawingId)
  })
}

/** Tar bort ett enskilt rum (t.ex. feldetekterat) och dess ev. inventering och foton. */
export async function deleteRoomCascade(roomId: string): Promise<void> {
  await db.transaction('rw', [db.rooms, db.inventoryRecords, db.roomPhotos], async () => {
    await db.inventoryRecords.where('roomId').equals(roomId).delete()
    await db.roomPhotos.where('roomId').equals(roomId).delete()
    await db.rooms.delete(roomId)
  })
}

/**
 * Tar bort en materialtagg ur projektets taggbibliotek och plockar bort alla referenser till den
 * i befintliga rums rader (oavsett kategori – en äldre bugg eller importerad data skulle
 * teoretiskt kunna lämna en referens i fel kategori, så vi städar alla för säkerhets skull).
 */
export async function deleteMaterialTagCascade(projectId: string, tagId: string): Promise<void> {
  await db.transaction('rw', [db.materialTags, db.rooms, db.inventoryRecords, db.tagPhotos], async () => {
    const rooms = await db.rooms.where('projectId').equals(projectId).toArray()
    const records = await db.inventoryRecords.where('roomId').anyOf(rooms.map((r) => r.id)).toArray()
    for (const record of records) {
      const hasReference = Object.values(record.categories).some((entry) => entry.materials.some((m) => m.tagId === tagId))
      if (!hasReference) continue
      await db.inventoryRecords.update(record.id, {
        categories: Object.fromEntries(
          Object.entries(record.categories).map(([category, entry]) => [
            category,
            { ...entry, materials: entry.materials.filter((m) => m.tagId !== tagId) },
          ]),
        ) as InventoryRecord['categories'],
      })
    }
    await db.tagPhotos.where('tagId').equals(tagId).delete()
    await db.materialTags.delete(tagId)
  })
}

/**
 * Tar bort ett typrum. Rum som var kopplade till det friges automatiskt – precis som en manuell
 * frigöring skrivs typrummets senaste data in i respektive rums egen inventeringspost först, så
 * att ingen information bara försvinner tyst när typrummet tas bort.
 */
export async function deleteRoomTypeCascade(roomType: RoomType): Promise<void> {
  await db.transaction('rw', [db.rooms, db.inventoryRecords, db.roomTypes], async () => {
    const rooms = await db.rooms.where('roomTypeId').equals(roomType.id).toArray()
    for (const room of rooms) {
      const record = await db.inventoryRecords.where('roomId').equals(room.id).first()
      if (record) {
        await db.inventoryRecords.update(record.id, {
          categories: roomType.categories,
          antalPersoner: roomType.antalPersoner,
          funktionsbeskrivning: roomType.funktionsbeskrivning,
          dagsljus: roomType.dagsljus,
          storlek: roomType.storlek,
          updatedAt: Date.now(),
        })
      }
      await db.rooms.update(room.id, { roomTypeId: null })
    }
    await db.roomTypes.delete(roomType.id)
  })
}
