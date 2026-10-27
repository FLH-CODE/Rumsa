import { db, type InventoryRecord } from '../../db'

/**
 * Tar bort ett helt projekt och allt som hör till det – ritningar (inkl. PDF-blobbar), sidor,
 * rum och inventeringar. Utan kaskaden skulle borttagning av projektet bara dölja datan, inte
 * städa bort den, vilket sakta fyller upp lagringsutrymmet.
 */
export async function deleteProjectCascade(projectId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.projects, db.levels, db.drawings, db.drawingPages, db.rooms, db.inventoryRecords, db.materialTags],
    async () => {
      const rooms = await db.rooms.where('projectId').equals(projectId).toArray()
      await db.inventoryRecords.where('roomId').anyOf(rooms.map((r) => r.id)).delete()
      await Promise.all([
        db.rooms.where('projectId').equals(projectId).delete(),
        db.drawingPages.where('projectId').equals(projectId).delete(),
        db.drawings.where('projectId').equals(projectId).delete(),
        db.levels.where('projectId').equals(projectId).delete(),
        db.materialTags.where('projectId').equals(projectId).delete(),
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
  await db.transaction('rw', [db.drawings, db.drawingPages, db.rooms, db.inventoryRecords], async () => {
    const pages = await db.drawingPages.where('drawingId').equals(drawingId).toArray()
    const pageIds = pages.map((p) => p.id)
    const rooms = await db.rooms.where('drawingPageId').anyOf(pageIds).toArray()
    await db.inventoryRecords.where('roomId').anyOf(rooms.map((r) => r.id)).delete()
    await db.rooms.where('drawingPageId').anyOf(pageIds).delete()
    await db.drawingPages.where('drawingId').equals(drawingId).delete()
    await db.drawings.delete(drawingId)
  })
}

/** Tar bort ett enskilt rum (t.ex. feldetekterat) och dess ev. inventering. */
export async function deleteRoomCascade(roomId: string): Promise<void> {
  await db.transaction('rw', [db.rooms, db.inventoryRecords], async () => {
    await db.inventoryRecords.where('roomId').equals(roomId).delete()
    await db.rooms.delete(roomId)
  })
}

/**
 * Tar bort en materialtagg ur projektets taggbibliotek och plockar bort alla referenser till den
 * i befintliga rums rader (oavsett kategori – en äldre bugg eller importerad data skulle
 * teoretiskt kunna lämna en referens i fel kategori, så vi städar alla för säkerhets skull).
 */
export async function deleteMaterialTagCascade(projectId: string, tagId: string): Promise<void> {
  await db.transaction('rw', [db.materialTags, db.rooms, db.inventoryRecords], async () => {
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
    await db.materialTags.delete(tagId)
  })
}
