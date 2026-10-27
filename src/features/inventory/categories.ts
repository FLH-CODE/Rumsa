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

/** Golv/Vägg/Tak får en liten dekorativ perspektivillustration överst i sin kategori (som en
 * förenklad version av rummets uppbyggnad) – Övrigt/Utrustning har ingen naturlig motsvarighet. */
export const CATEGORY_HAS_ILLUSTRATION: Record<RoomCategory, boolean> = {
  golv: true,
  vagg: true,
  tak: true,
  ovrigt: false,
  utrustning: false,
}

export function isRoomCategory(tab: RoomTab): tab is RoomCategory {
  return (ROOM_CATEGORIES as readonly string[]).includes(tab)
}
