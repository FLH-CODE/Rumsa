import { db, type RoomCardCategory } from '../../db'

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
      db.roomCardGroups,
    ],
    async () => {
      const rooms = await db.rooms.where('projectId').equals(projectId).toArray()
      await db.inventoryRecords.where('roomId').anyOf(rooms.map((r) => r.id)).delete()
      await Promise.all([
        db.rooms.where('projectId').equals(projectId).delete(),
        db.drawingPages.where('projectId').equals(projectId).delete(),
        db.drawings.where('projectId').equals(projectId).delete(),
        db.levels.where('projectId').equals(projectId).delete(),
        db.materialTags.where('projectId').equals(projectId).delete(),
        db.roomCardGroups.where('projectId').equals(projectId).delete(),
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
 * Tar bort en rumskorts-grupp och lösgör (groupId: null) alla rader i alla rum i projektet som
 * hörde till den – raderna och deras ifyllda data finns kvar, bara ogrupperade (visas då
 * automatiskt i första gruppen inom samma flik istället, se GroupedRows). Rör bara den fliks
 * radfält (Ytskikt → rows, Utrustning → equipmentRows) som gruppen faktiskt hör till.
 */
export async function deleteRoomCardGroupCascade(
  projectId: string,
  groupId: string,
  category: RoomCardCategory,
): Promise<void> {
  await db.transaction('rw', [db.roomCardGroups, db.rooms, db.inventoryRecords], async () => {
    const rooms = await db.rooms.where('projectId').equals(projectId).toArray()
    const records = await db.inventoryRecords.where('roomId').anyOf(rooms.map((r) => r.id)).toArray()
    for (const record of records) {
      const rowsField = category === 'ytskikt' ? record.rows : record.equipmentRows
      if (!rowsField.some((row) => row.groupId === groupId)) continue
      const updated = rowsField.map((row) => (row.groupId === groupId ? { ...row, groupId: null } : row))
      if (category === 'ytskikt') {
        await db.inventoryRecords.update(record.id, { rows: updated })
      } else {
        await db.inventoryRecords.update(record.id, { equipmentRows: updated })
      }
    }
    await db.roomCardGroups.delete(groupId)
  })
}

/**
 * Tar bort en materialtagg (material- eller utrustningspool) ur projektets taggbibliotek och
 * plockar bort alla referenser till den i befintliga rum – i både Ytskikt- och Utrustning-raderna
 * (oavsett `kind` hör referensen rätt pool tack vare att man bara kan välja ur sin egen lista,
 * men vi städar båda ställena ifall en tagg ändå refereras fel genom en äldre bugg eller
 * importerad data).
 */
export async function deleteMaterialTagCascade(projectId: string, tagId: string): Promise<void> {
  await db.transaction('rw', [db.materialTags, db.rooms, db.inventoryRecords], async () => {
    const rooms = await db.rooms.where('projectId').equals(projectId).toArray()
    const records = await db.inventoryRecords.where('roomId').anyOf(rooms.map((r) => r.id)).toArray()
    const stripTag = (rows: typeof records[number]['rows']) =>
      rows.map((row) => ({ ...row, materials: row.materials.filter((m) => m.tagId !== tagId) }))
    for (const record of records) {
      const hasReference =
        record.rows.some((row) => row.materials.some((m) => m.tagId === tagId)) ||
        record.equipmentRows.some((row) => row.materials.some((m) => m.tagId === tagId))
      if (!hasReference) continue
      await db.inventoryRecords.update(record.id, {
        rows: stripTag(record.rows),
        equipmentRows: stripTag(record.equipmentRows),
      })
    }
    await db.materialTags.delete(tagId)
  })
}
