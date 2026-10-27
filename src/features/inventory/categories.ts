import type { ComponentType, SVGProps } from 'react'
import { ROOM_CATEGORIES, type RoomCategory } from '../../db'
import {
  FloorIcon,
  WallIcon,
  CeilingIcon,
  OtherIcon,
  FurnitureIcon,
  PersonIcon,
} from '../../components/icons'

/** Rumskortets flikar: de fem fasta materialkategorierna plus "funktion", som inte har rader/
 * taggar utan bara två enkla fält. Ordningen här styr ikonradens ordning. */
export type RoomTab = RoomCategory | 'funktion'
export const ROOM_TABS: RoomTab[] = ['funktion', 'golv', 'vagg', 'tak', 'utrustning', 'ovrigt']

export const CATEGORY_LABEL: Record<RoomTab, string> = {
  funktion: 'Funktion',
  golv: 'Golv',
  vagg: 'Vägg',
  tak: 'Tak',
  utrustning: 'Utrustning',
  ovrigt: 'Övrigt',
}

export const CATEGORY_ICON: Record<RoomTab, ComponentType<SVGProps<SVGSVGElement>>> = {
  funktion: PersonIcon,
  golv: FloorIcon,
  vagg: WallIcon,
  tak: CeilingIcon,
  utrustning: FurnitureIcon,
  ovrigt: OtherIcon,
}

/** Rivning är bara relevant för ytskiktskategorierna – Utrustning har ingen "rivning" att ange. */
export const CATEGORY_HAS_RIVNING: Record<RoomCategory, boolean> = {
  golv: true,
  vagg: true,
  tak: true,
  ovrigt: true,
  utrustning: false,
}

export function isRoomCategory(tab: RoomTab): tab is RoomCategory {
  return (ROOM_CATEGORIES as readonly string[]).includes(tab)
}
