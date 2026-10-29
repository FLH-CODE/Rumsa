import { db, createId } from '../../db'

/**
 * Döper om den NUVARANDE nivån (om sidan redan har en) – påverkar alla sidor som delar den nivån,
 * eftersom "nivå" är en delad egenskap (t.ex. "Plan 1"), inte unik per sida. Har sidan ingen nivå
 * än återanvänds en befintlig nivå med samma namn (annars kan man råka skapa dubbletter av t.ex.
 * "PLAN 7" om flera sidor saknar nivå samtidigt) eller skapas en ny, och sidan (plus dess redan
 * upptäckta rum) kopplas till den. Delas mellan "Namnge nivå"-dialogen i ritningsvisaren och
 * ritningslistan på projektets startsida, så de alltid beter sig likadant.
 */
export async function renameOrAssignLevel(
  projectId: string,
  drawingPageId: string,
  currentLevelId: string | null,
  name: string,
): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return

  if (currentLevelId) {
    await db.levels.update(currentLevelId, { name: trimmed })
    return
  }

  await db.transaction('rw', [db.levels, db.drawingPages, db.rooms], async () => {
    const existingLevels = await db.levels.where('projectId').equals(projectId).toArray()
    let target = existingLevels.find((l) => l.name.toLowerCase() === trimmed.toLowerCase())

    if (!target) {
      const numericMatch = trimmed.match(/\d+/)
      target = {
        id: createId(),
        projectId,
        name: trimmed,
        order: numericMatch ? parseInt(numericMatch[0], 10) : existingLevels.length,
      }
      await db.levels.add(target)
    }

    await db.drawingPages.update(drawingPageId, { levelId: target.id })
    // Rum som redan upptäckts på sidan innan nivån fanns pekade på levelId: null – utan den här
    // uppdateringen skulle de tappa bort nivåkopplingen i t.ex. Excel-exporten.
    await db.rooms.where('drawingPageId').equals(drawingPageId).modify({ levelId: target.id })
  })
}
