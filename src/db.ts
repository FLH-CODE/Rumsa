import Dexie, { type EntityTable } from 'dexie'

export interface Project {
  id: string
  name: string
  /** Regex (as string) som identifierar rumsnummer i projektets ritningar, t.ex. "^\\d{4}$" eller "^P\\d{2}:\\w+$". */
  roomNumberPattern: string
  createdAt: number
  updatedAt: number
}

export interface Level {
  id: string
  projectId: string
  name: string
  order: number
}

export interface Drawing {
  id: string
  projectId: string
  fileName: string
  pdfBlob: Blob
  pageCount: number
  uploadedAt: number
}

/** En sida i en ritningsfil, kopplad till en nivå. */
export interface DrawingPage {
  id: string
  drawingId: string
  projectId: string
  pageIndex: number
  levelId: string | null
  thumbnailDataUrl: string | null
}

export interface Room {
  id: string
  projectId: string
  levelId: string | null
  drawingPageId: string
  roomNumber: string
  roomName: string
  /** Position för rumstaggen i PDF-sidans punktkoordinater (oroterat). */
  tagX: number
  tagY: number
  templateId: string | null
}

export interface InventoryRow {
  id: string
  surface: string
  rivning: string
  malningSortKulor: string
}

export interface InventoryRecord {
  id: string
  roomId: string
  rows: InventoryRow[]
  updatedAt: number
}

export interface InventoryTemplate {
  id: string
  projectId: string
  name: string
  defaultRows: Array<{ surface: string }>
}

/** Tidigare inskrivna värden per fält, används för autoifyllnad/färgkodning. */
export interface MaterialValue {
  id: string
  projectId: string
  field: 'rivning' | 'malningSortKulor'
  value: string
  colorIndex: number
  lastUsedAt: number
}

class RumsaDB extends Dexie {
  projects!: EntityTable<Project, 'id'>
  levels!: EntityTable<Level, 'id'>
  drawings!: EntityTable<Drawing, 'id'>
  drawingPages!: EntityTable<DrawingPage, 'id'>
  rooms!: EntityTable<Room, 'id'>
  inventoryRecords!: EntityTable<InventoryRecord, 'id'>
  inventoryTemplates!: EntityTable<InventoryTemplate, 'id'>
  materialValues!: EntityTable<MaterialValue, 'id'>

  constructor() {
    super('rumsa')
    this.version(1).stores({
      projects: 'id, name, updatedAt',
      levels: 'id, projectId, order',
      drawings: 'id, projectId, uploadedAt',
      drawingPages: 'id, drawingId, projectId, levelId',
      rooms: 'id, projectId, levelId, drawingPageId, roomNumber',
      inventoryRecords: 'id, roomId, updatedAt',
      inventoryTemplates: 'id, projectId',
      materialValues: 'id, projectId, field, value',
    })
  }
}

export const db = new RumsaDB()

export function createId(): string {
  return crypto.randomUUID()
}
