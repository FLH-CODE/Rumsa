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
  /** Vilken RoomCardGroup raden hör till, eller null om den inte är grupperad än. Ordningen
   * inom en grupp (och bland ogrupperade rader) styrs av radernas inbördes position i
   * InventoryRecord.rows – ingen separat sorteringsnyckel behövs. */
  groupId: string | null
}

/** Vilken av rumskortets tre flikar en grupp/rad hör till. */
export type RoomCardCategory = 'ytskikt' | 'utrustning'

/**
 * En namngiven grupp att sortera rumskortets rader under (t.ex. "Golv", "Väggar"), för att kunna
 * organisera ett rumskort som har många rader. Delas av hela projektet (inte per rum) – ordningen
 * och om gruppen är ihopfälld är alltså samma oavsett vilket rum man öppnar, så att man kan
 * fälla ihop det man inte jobbar med just nu utan att behöva göra om det för varje rum. Ytskikt
 * och Utrustning har varsin uppsättning grupper (en grupp hör bara till en av flikarna).
 */
export interface RoomCardGroup {
  id: string
  projectId: string
  category: RoomCardCategory
  name: string
  order: number
  collapsed: boolean
}

export interface InventoryRecord {
  id: string
  roomId: string
  /** Ytskikt-fliken: en rad per ytbehandling (Golv/Vägg/Tak osv.), se InventoryRow. */
  rows: InventoryRow[]
  /** Utrustning-fliken: samma radstruktur som Ytskikt, fast för utrustningsposter (t.ex.
   * "Möblering", "Lösa mattor") istället för ytbehandlingar. */
  equipmentRows: InventoryRow[]
  /** Funktion-fliken: ett par enkla, fasta fält (inte rader/grupper) – samma fält på varje rum. */
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
  /** 'material' för Ytskikt-fliken (ursprungliga "materialtaggar"), 'equipment' för en
   * motsvarande återanvändbar lista i Utrustning-fliken – samma mekanik, skilda pooler så en
   * städrutin inte blandas ihop med en klinkertyp i förslagslistorna. */
  kind: 'material' | 'equipment'
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
  roomCardGroups!: EntityTable<RoomCardGroup, 'id'>

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

    // v4: rader går att organisera i namngivna grupper (t.ex. "Golv", "Väggar") som delas av
    // hela projektet – se RoomCardGroup. Befintliga rader blir ogrupperade (groupId: null) tills
    // man själv sorterar in dem.
    this.version(4)
      .stores({
        roomCardGroups: 'id, projectId, order',
      })
      .upgrade(async (tx) => {
        await tx
          .table('inventoryRecords')
          .toCollection()
          .modify((record: InventoryRecord) => {
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
    // materialtaggar får en `kind` så Utrustning kan ha en egen, motsvarande taggpool.
    this.version(5)
      .stores({
        roomCardGroups: 'id, projectId, category, order',
      })
      .upgrade(async (tx) => {
        await tx
          .table('roomCardGroups')
          .toCollection()
          .modify((group: RoomCardGroup) => {
            if (!group.category) group.category = 'ytskikt'
          })
        await tx
          .table('materialTags')
          .toCollection()
          .modify((tag: MaterialTag) => {
            if (!tag.kind) tag.kind = 'material'
          })
        await tx
          .table('inventoryRecords')
          .toCollection()
          .modify((record: InventoryRecord) => {
            if (!Array.isArray(record.equipmentRows)) record.equipmentRows = []
            if (typeof record.antalPersoner !== 'string') record.antalPersoner = ''
            if (typeof record.funktionsbeskrivning !== 'string') record.funktionsbeskrivning = ''
          })
      })

    // Normaliserar varje läst post så att `materials` alltid är en array, `ovrigt` alltid en
    // sträng och `groupId` alltid finns (null eller en sträng), oavsett vad som faktiskt ligger
    // lagrat – t.ex. en flik som hann skriva en post med den gamla formen innan den själv laddade
    // om efter en uppgradering. Utan detta kraschar varje ställe som gör
    // `row.materials.some/.map/.filter` eller läser `row.ovrigt`/`row.groupId` på en sådan post.
    // Samma sak för `equipmentRows`/`antalPersoner`/`funktionsbeskrivning` på själva posten.
    const normalizeRows = (rows: InventoryRow[]) =>
      rows.map((row) => ({ ...row, materials: row.materials ?? [], ovrigt: row.ovrigt ?? '', groupId: row.groupId ?? null }))
    const rowsNeedNormalizing = (rows: InventoryRow[] | undefined) =>
      rows?.some(
        (row) => !Array.isArray(row.materials) || typeof row.ovrigt !== 'string' || typeof row.groupId === 'undefined',
      ) ?? false

    this.inventoryRecords.hook('reading', (record: InventoryRecord) => {
      const needsRows = rowsNeedNormalizing(record.rows)
      const needsEquipmentRows = !Array.isArray(record.equipmentRows) || rowsNeedNormalizing(record.equipmentRows)
      const needsFunction = typeof record.antalPersoner !== 'string' || typeof record.funktionsbeskrivning !== 'string'
      if (!needsRows && !needsEquipmentRows && !needsFunction) return record
      return {
        ...record,
        rows: needsRows ? normalizeRows(record.rows ?? []) : record.rows,
        equipmentRows: needsEquipmentRows ? normalizeRows(record.equipmentRows ?? []) : record.equipmentRows,
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
