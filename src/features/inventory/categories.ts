import type { ComponentType, SVGProps } from 'react'
import { ROOM_CATEGORIES, type RoomCategory } from '../../db'
import { OtherIcon, FurnitureIcon, PersonIcon, CameraIcon } from '../../components/icons'

/** Rumskortets flikar: de fem fasta materialkategorierna plus "funktion" (två enkla fält, inga
 * materialtaggar) och "bilder" (foton knutna till rummet, inga materialtaggar heller). */
export type RoomTab = RoomCategory | 'funktion' | 'bilder'

/** Golv/Vägg/Tak väljs genom att trycka direkt på motsvarande yta i perspektivillustrationen
 * (se RoomPerspectiveNav) – bara de här fyra (plus bilder) har en egen, enkel ikonknapp i raden
 * bredvid. "Bilder" sist, direkt efter Övrigt. */
export type RailTab = 'funktion' | 'utrustning' | 'ovrigt' | 'bilder'
export const RAIL_TABS: RailTab[] = ['funktion', 'utrustning', 'ovrigt', 'bilder']

export const CATEGORY_LABEL: Record<RoomTab, string> = {
  funktion: 'Funktion',
  golv: 'Golv',
  vagg: 'Vägg',
  tak: 'Tak',
  utrustning: 'Utrustning',
  ovrigt: 'Övrigt',
  bilder: 'Bilder',
}

export const CATEGORY_ICON: Record<RailTab, ComponentType<SVGProps<SVGSVGElement>>> = {
  funktion: PersonIcon,
  utrustning: FurnitureIcon,
  ovrigt: OtherIcon,
  bilder: CameraIcon,
}

export function isRoomCategory(tab: RoomTab): tab is RoomCategory {
  return (ROOM_CATEGORIES as readonly string[]).includes(tab)
}
