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

/**
 * En referens till en materialtagg inom en rad, med en valfri notering om var/hur den gäller
 * (t.ex. "upp till 1200mm"). En rad kan ha flera – t.ex. två olika klinkertyper på samma vägg,
 * en upp till en viss höjd och en upp till tak.
 */
export interface MaterialReference {
  id: string
  tagId: string
  note: string
}

export interface InventoryRow {
  id: string
  surface: string
  rivning: string
  materials: MaterialReference[]
  /** Fritextfält för övrigt som inte passar in i Rivning/Material, t.ex. anmärkningar om skicket. */
  ovrigt: string
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

/**
 * En materialtagg – definieras en gång per projekt (t.ex. "Klinker 1" med en fullständig
 * beskrivning) och återanvänds sedan i valfritt antal rum, istället för att skriva ut samma
 * specifikation om och om igen. Motsvarar "taggarna" i den ursprungliga skissen.
 */
export interface MaterialTag {
  id: string
  projectId: string
  code: string
  description: string
  colorIndex: number
  createdAt: number
}

class RumsaDB extends Dexie {
  projects!: EntityTable<Project, 'id'>
  levels!: EntityTable<Level, 'id'>
  drawings!: EntityTable<Drawing, 'id'>
  drawingPages!: EntityTable<DrawingPage, 'id'>
  rooms!: EntityTable<Room, 'id'>
  inventoryRecords!: EntityTable<InventoryRecord, 'id'>
  inventoryTemplates!: EntityTable<InventoryTemplate, 'id'>
  materialTags!: EntityTable<MaterialTag, 'id'>

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
    // v2: fria materialtexter ersätts av en delad taggbibliotek (materialTags) som rum refererar
    // till, så att en tagg (t.ex. "Klinker 1") kan beskrivas en gång och återanvändas – se
    // features/tags. En rad kan nu lista flera materialreferenser istället för en enda textrad.
    this.version(2)
      .stores({
        materialValues: null,
        materialTags: 'id, projectId, code',
      })
      .upgrade(async (tx) => {
        await tx
          .table('inventoryRecords')
          .toCollection()
          .modify((record: InventoryRecord) => {
            for (const row of record.rows ?? []) {
              if (!Array.isArray(row.materials)) {
                row.materials = []
              }
            }
          })
      })

    // v3: lägger till ett tredje fritextfält per rad ("Övrigt"), vid sidan av Rivning – för
    // anteckningar som inte passar i någotdera.
    this.version(3).upgrade(async (tx) => {
      await tx
        .table('inventoryRecords')
        .toCollection()
        .modify((record: InventoryRecord) => {
          for (const row of record.rows ?? []) {
            if (typeof row.ovrigt !== 'string') {
              row.ovrigt = ''
            }
          }
        })
    })

    // Normaliserar varje läst post så att `materials` alltid är en array och `ovrigt` alltid en
    // sträng, oavsett vad som faktiskt ligger lagrat – t.ex. en flik som hann skriva en post med
    // den gamla formen innan den själv laddade om efter en uppgradering. Utan detta kraschar
    // varje ställe som gör `row.materials.some/.map/.filter` eller läser `row.ovrigt` på en
    // sådan post.
    this.inventoryRecords.hook('reading', (record: InventoryRecord) => {
      if (record.rows?.some((row) => !Array.isArray(row.materials) || typeof row.ovrigt !== 'string')) {
        return {
          ...record,
          rows: record.rows.map((row) => ({ ...row, materials: row.materials ?? [], ovrigt: row.ovrigt ?? '' })),
        }
      }
      return record
    })

    // Om databasen uppgraderas i en annan flik (t.ex. efter en ny deploy) ska den här fliken
    // ladda om istället för att fortsätta skriva mot ett schema som inte längre stämmer.
    this.on('versionchange', () => {
      window.location.reload()
    })
  }
}

export const db = new RumsaDB()

export function createId(): string {
  return crypto.randomUUID()
}
