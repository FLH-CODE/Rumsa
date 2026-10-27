import type { ComponentType, SVGProps } from 'react'
import { ROOM_CATEGORIES, type RoomCategory } from '../../db'
import { OtherIcon, FurnitureIcon, PersonIcon } from '../../components/icons'

/** Rumskortets flikar: de fem fasta materialkategorierna plus "funktion", som inte har
 * materialtaggar utan bara två enkla fält. */
export type RoomTab = RoomCategory | 'funktion'

/** Golv/Vägg/Tak väljs genom att trycka direkt på motsvarande yta i perspektivillustrationen
 * (se RoomPerspectiveNav) – bara de här tre har en egen, enkel ikonknapp i raden bredvid. */
export type RailTab = 'funktion' | 'utrustning' | 'ovrigt'
export const RAIL_TABS: RailTab[] = ['funktion', 'utrustning', 'ovrigt']

export const CATEGORY_LABEL: Record<RoomTab, string> = {
  funktion: 'Funktion',
  golv: 'Golv',
  vagg: 'Vägg',
  tak: 'Tak',
  utrustning: 'Utrustning',
  ovrigt: 'Övrigt',
}

export const CATEGORY_ICON: Record<RailTab, ComponentType<SVGProps<SVGSVGElement>>> = {
  funktion: PersonIcon,
  utrustning: FurnitureIcon,
  ovrigt: OtherIcon,
}

export function isRoomCategory(tab: RoomTab): tab is RoomCategory {
  return (ROOM_CATEGORIES as readonly string[]).includes(tab)
}
