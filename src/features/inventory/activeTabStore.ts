import type { RoomTab } from './categories'

/**
 * Minns senast valda arbetsläge (flik) i rumskortet, oavsett vilket rum – så att man fortsätter
 * där man var när man öppnar nästa rum (eller samma igen), istället för att alltid börja om på
 * Funktion. Ligger i sessionStorage (inte IndexedDB) eftersom det är rent UI-tillstånd.
 */
const STORAGE_KEY = 'rumsa:activeRoomTab'

export function getLastActiveTab(): RoomTab | undefined {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (raw as RoomTab) : undefined
  } catch {
    return undefined
  }
}

export function setLastActiveTab(tab: RoomTab): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, tab)
  } catch {
    // Privat läge/fullt lagringsutrymme – ingen funktionell nackdel, bara inget ihågkommet läge.
  }
}
