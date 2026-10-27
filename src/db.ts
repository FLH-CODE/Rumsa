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

/**
 * Rumskortets fasta kategorier – ersätter de tidigare flikarna OCH de fritt namngivna grupperna.
 * Fast lista (inte användarredigerbar) så att en golvtagg aldrig kan dyka upp som förslag på en
 * vägg: varje tagg och varje rad hör till exakt en av dessa. "Funktion" (antal personer/
 * funktionsbeskrivning) har inga rader/taggar och ingår därför inte här.
 */
export const ROOM_CATEGORIES = ['golv', 'vagg', 'tak', 'ovrigt', 'utrustning'] as const
export type RoomCategory = (typeof ROOM_CATEGORIES)[number]

export interface InventoryRow {
  id: string
  category: RoomCategory
  surface: string
  rivning: string
  materials: MaterialReference[]
  /** Fritextfält för övrigt som inte passar in i Rivning/Material, t.ex. anmärkningar om skicket. */
  ovrigt: string
}

export interface InventoryRecord {
  id: string
  roomId: string
  /** Alla rader, oavsett kategori – se InventoryRow.category. */
  items: InventoryRow[]
  /** "Funktion": ett par enkla, fasta fält (inte rader) – samma fält på varje rum. */
  antalPersoner: string
  funktionsbeskrivning: string
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
  /** Vilken av de fasta kategorierna taggen hör till – avgör i vilken kategoris taggpalett den
   * visas och går att dra in. En tagg hör bara till en kategori. */
  category: RoomCategory
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
          .modify((record: { rows?: Array<{ materials?: unknown[] }> }) => {
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
        .modify((record: { rows?: Array<{ ovrigt?: string }> }) => {
          for (const row of record.rows ?? []) {
            if (typeof row.ovrigt !== 'string') {
              row.ovrigt = ''
            }
          }
        })
    })

    // v4: rader går att organisera i namngivna grupper (t.ex. "Golv", "Väggar") som delas av
    // hela projektet – se historiska RoomCardGroup (borttagen i v6). Befintliga rader blir
    // ogrupperade (groupId: null) tills man själv sorterar in dem.
    this.version(4)
      .stores({
        roomCardGroups: 'id, projectId, order',
      })
      .upgrade(async (tx) => {
        await tx
          .table('inventoryRecords')
          .toCollection()
          .modify((record: { rows?: Array<{ groupId?: string | null }> }) => {
            for (const row of record.rows ?? []) {
              if (typeof row.groupId === 'undefined') {
                row.groupId = null
              }
            }
          })
      })

    // v5: rumskortet delas upp i tre flikar – Funktion (ett par enkla fält), Utrustning (samma
    // rad/grupp-system som Ytskikt, fast för utrustningsposter) och Ytskikt (oförändrat, bara
    // flyttat till en egen flik). Grupper hör nu till en av flikarna (category), och
    // materialtaggar får en `kind` så Utrustning kan ha en egen, motsvarande taggpool. (Flikarna,
    // grupperna och `kind` ersattes i sin tur av en fast kategorilista i v6.)
    this.version(5)
      .stores({
        roomCardGroups: 'id, projectId, category, order',
      })
      .upgrade(async (tx) => {
        await tx
          .table('roomCardGroups')
          .toCollection()
          .modify((group: { category?: string }) => {
            if (!group.category) group.category = 'ytskikt'
          })
        await tx
          .table('materialTags')
          .toCollection()
          .modify((tag: { kind?: string }) => {
            if (!tag.kind) tag.kind = 'material'
          })
        await tx
          .table('inventoryRecords')
          .toCollection()
          .modify((record: { equipmentRows?: unknown[]; antalPersoner?: string; funktionsbeskrivning?: string }) => {
            if (!Array.isArray(record.equipmentRows)) record.equipmentRows = []
            if (typeof record.antalPersoner !== 'string') record.antalPersoner = ''
            if (typeof record.funktionsbeskrivning !== 'string') record.funktionsbeskrivning = ''
          })
      })

    // v6: rumskortets flikar OCH fritt namngivna grupper ersätts av en fast kategorilista (Golv,
    // Vägg, Tak, Övrigt, Utrustning) – se ROOM_CATEGORIES. En golvtagg ska aldrig kunna visas som
    // förslag på en vägg, så materialtaggar får samma fasta kategori istället för den gamla, grövre
    // `kind`. `rows`/`equipmentRows`/`groupId` slås ihop till en enda `items`-lista per post, och
    // roomCardGroups-tabellen (de fritt namngivna grupperna) tas bort. Legacy-gruppnamn som
    // innehåller "golv"/"vägg"/"tak" gissas in i rätt ny kategori på bästa sätt – allt annat
    // (inklusive alla gamla "material"-taggar, som inte hade någon sådan uppdelning) hamnar i
    // "Övrigt" tills man själv sorterar om det.
    this.version(6)
      .stores({
        roomCardGroups: null,
      })
      .upgrade(async (tx) => {
        const legacyGroups = await tx.table('roomCardGroups').toArray()
        const legacyGroupNameById = new Map<string, string>(
          legacyGroups.map((g: { id: string; name: string }) => [g.id, (g.name ?? '').trim().toLowerCase()]),
        )
        const guessCategory = (groupId: string | null | undefined): RoomCategory => {
          const name = groupId ? legacyGroupNameById.get(groupId) : undefined
          if (!name) return 'ovrigt'
          if (name.includes('golv')) return 'golv'
          if (name.includes('vägg') || name.includes('vagg')) return 'vagg'
          if (name.includes('tak')) return 'tak'
          return 'ovrigt'
        }

        await tx
          .table('materialTags')
          .toCollection()
          .modify((tag: MaterialTag & { kind?: 'material' | 'equipment' }) => {
            tag.category = tag.kind === 'equipment' ? 'utrustning' : 'ovrigt'
            delete tag.kind
          })

        await tx
          .table('inventoryRecords')
          .toCollection()
          .modify((record: InventoryRecord & { rows?: unknown[]; equipmentRows?: unknown[] }) => {
            type LegacyRow = {
              id: string
              surface?: string
              rivning?: string
              materials?: MaterialReference[]
              ovrigt?: string
              groupId?: string | null
            }
            const items: InventoryRow[] = []
            for (const row of (record.rows as LegacyRow[] | undefined) ?? []) {
              items.push({
                id: row.id,
                category: guessCategory(row.groupId),
                surface: row.surface ?? '',
                rivning: row.rivning ?? '',
                materials: row.materials ?? [],
                ovrigt: row.ovrigt ?? '',
              })
            }
            for (const row of (record.equipmentRows as LegacyRow[] | undefined) ?? []) {
              items.push({
                id: row.id,
                category: 'utrustning',
                surface: row.surface ?? '',
                rivning: '',
                materials: row.materials ?? [],
                ovrigt: row.ovrigt ?? '',
              })
            }
            record.items = items
            delete record.rows
            delete record.equipmentRows
          })
      })

    // Normaliserar varje läst post så att `items` alltid är en array med giltiga fält, oavsett vad
    // som faktiskt ligger lagrat – t.ex. en flik som hann skriva en post med den gamla formen innan
    // den själv laddade om efter en uppgradering. Utan detta kraschar varje ställe som gör
    // `item.materials.some/.map/.filter` eller läser `item.ovrigt`/`item.category` på en sådan post.
    const normalizeItems = (items: InventoryRow[]) =>
      items.map((item) => ({
        ...item,
        category: ROOM_CATEGORIES.includes(item.category) ? item.category : 'ovrigt',
        materials: item.materials ?? [],
        ovrigt: item.ovrigt ?? '',
      }))
    const itemsNeedNormalizing = (items: InventoryRow[] | undefined) =>
      items?.some(
        (item) => !ROOM_CATEGORIES.includes(item.category) || !Array.isArray(item.materials) || typeof item.ovrigt !== 'string',
      ) ?? false

    this.inventoryRecords.hook('reading', (record: InventoryRecord) => {
      const needsItems = !Array.isArray(record.items) || itemsNeedNormalizing(record.items)
      const needsFunction = typeof record.antalPersoner !== 'string' || typeof record.funktionsbeskrivning !== 'string'
      if (!needsItems && !needsFunction) return record
      return {
        ...record,
        items: needsItems ? normalizeItems(record.items ?? []) : record.items,
        antalPersoner: record.antalPersoner ?? '',
        funktionsbeskrivning: record.funktionsbeskrivning ?? '',
      }
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
