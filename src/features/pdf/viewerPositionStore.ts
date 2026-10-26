/**
 * Minns senaste pan/zoom-läge per ritningssida, så man kommer tillbaka till samma vy efter att
 * ha öppnat ett rum eller navigerat bort och tillbaka till visaren – annars centrerades sidan om
 * från början varje gång. Ligger i sessionStorage (inte IndexedDB) eftersom det är ett rent
 * UI-tillstånd utan sakligt värde att synka eller bevara mellan enheter/sessioner.
 */
export interface ViewerPosition {
  positionX: number
  positionY: number
  scale: number
}

function storageKey(drawingPageId: string): string {
  return `rumsa:viewerPos:${drawingPageId}`
}

export function getViewerPosition(drawingPageId: string): ViewerPosition | undefined {
  try {
    const raw = sessionStorage.getItem(storageKey(drawingPageId))
    if (!raw) return undefined
    const parsed = JSON.parse(raw)
    if (
      typeof parsed?.positionX === 'number' &&
      typeof parsed?.positionY === 'number' &&
      typeof parsed?.scale === 'number'
    ) {
      return parsed
    }
    return undefined
  } catch {
    return undefined
  }
}

export function setViewerPosition(drawingPageId: string, position: ViewerPosition): void {
  try {
    sessionStorage.setItem(storageKey(drawingPageId), JSON.stringify(position))
  } catch {
    // Privat läge/fullt lagringsutrymme – ingen funktionell nackdel, bara ingen ihågkommen vy.
  }
}
