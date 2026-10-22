import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { db, createId, type DrawingPage, type Level, type Room } from '../db'
import { useAutosave, type SaveStatus } from '../hooks/useAutosave'
import { useElementSize } from '../hooks/useElementSize'
import { usePdfDocument } from '../features/pdf/usePdfDocument'
import { PdfPageCanvas, PDF_MAX_ZOOM } from '../features/pdf/PdfPageCanvas'
import { syncRoomsForPage } from '../features/pdf/syncRooms'
import { TagColorFilterSheet } from '../features/pdf/TagColorFilterSheet'
import { RoomInventorySheet } from '../features/inventory/RoomInventorySheet'
import { TagsOverviewPanel } from '../features/tags/TagsOverviewPanel'
import { colorForValue } from '../features/tags/colorForValue'
import { TagIcon, FilterIcon } from '../components/icons'

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Sparar…',
  saved: 'Sparat',
  error: 'Kunde inte spara',
}

export default function DrawingViewerPage() {
  const { projectId, drawingPageId } = useParams<{ projectId: string; drawingPageId: string }>()
  const navigate = useNavigate()
  // Öppen som standard på bredare skärmar, stängd på mobil där panelen annars tar en stor del
  // av en redan liten yta.
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 640)
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [addRoomMode, setAddRoomMode] = useState(false)
  const [zoomScale, setZoomScale] = useState(1)
  const [mainRef, mainSize] = useElementSize<HTMLDivElement>()
  const [showTagsOverview, setShowTagsOverview] = useState(false)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [filterTagId, setFilterTagId] = useState<string | null>(null)

  const pages = useLiveQuery(
    () => db.drawingPages.where('projectId').equals(projectId ?? '').toArray(),
    [projectId],
  )
  const levels = useLiveQuery(() => db.levels.where('projectId').equals(projectId ?? '').toArray(), [projectId])

  const sortedPages = useMemo(() => sortPages(pages, levels), [pages, levels])
  const levelById = useMemo(() => new Map((levels ?? []).map((l) => [l.id, l])), [levels])

  const currentIndex = sortedPages.findIndex((p) => p.id === drawingPageId)
  const currentPage = currentIndex >= 0 ? sortedPages[currentIndex] : null
  const { doc, error: docError } = usePdfDocument(currentPage?.drawingId ?? null)
  const rooms = useLiveQuery(
    () => (currentPage ? db.rooms.where('drawingPageId').equals(currentPage.id).toArray() : []),
    [currentPage?.id],
  )
  const roomIdsKey = (rooms ?? []).map((r) => r.id).join(',')
  const records = useLiveQuery(
    () => db.inventoryRecords.where('roomId').anyOf(roomIdsKey ? roomIdsKey.split(',') : []).toArray(),
    [roomIdsKey],
  )
  const completedRoomIds = useMemo(() => {
    const set = new Set<string>()
    for (const record of records ?? []) {
      if (record.rows.some((row) => row.rivning.trim() || row.materials.length > 0 || row.ovrigt.trim())) {
        set.add(record.roomId)
      }
    }
    return set
  }, [records])

  const tags = useLiveQuery(
    () => db.materialTags.where('projectId').equals(projectId ?? '').sortBy('code'),
    [projectId],
  )
  const filterTag = tags?.find((t) => t.id === filterTagId) ?? null
  const highlightRoomIds = useMemo(() => {
    if (!filterTagId) return null
    const set = new Set<string>()
    for (const record of records ?? []) {
      if (record.rows.some((row) => row.materials.some((m) => m.tagId === filterTagId))) {
        set.add(record.roomId)
      }
    }
    return set
  }, [records, filterTagId])

  const handleDetectRooms = async () => {
    if (!doc || !currentPage || !projectId) return
    setDetecting(true)
    try {
      const project = await db.projects.get(projectId)
      const page = await doc.getPage(currentPage.pageIndex + 1)
      await syncRoomsForPage(page, currentPage, project?.roomNumberPattern ?? '^\\d{3,4}$')
    } finally {
      setDetecting(false)
    }
  }

  const handleCanvasTap = async (pdfX: number, pdfY: number) => {
    if (!currentPage || !projectId) return
    setAddRoomMode(false)
    const newRoom: Room = {
      id: createId(),
      projectId,
      levelId: currentPage.levelId,
      drawingPageId: currentPage.id,
      roomNumber: '',
      roomName: '',
      tagX: pdfX,
      tagY: pdfY,
      templateId: null,
    }
    await db.rooms.add(newRoom)
    setSelectedRoom(newRoom)
  }

  if (pages === undefined || levels === undefined) {
    return (
      <div className="viewer-page">
        <p style={{ margin: 'auto', color: '#fff' }}>Laddar…</p>
      </div>
    )
  }

  if (sortedPages.length === 0 || !currentPage) {
    return (
      <div className="viewer-page">
        <button
          className="viewer-float-btn back"
          onClick={() => navigate(`/project/${projectId}`)}
          aria-label="Tillbaka till projekt"
        >
          ✕
        </button>
        <div className="viewer-empty">Ritningen kunde inte hittas.</div>
      </div>
    )
  }

  function goTo(pageId: string) {
    setZoomScale(1)
    navigate(`/project/${projectId}/viewer/${pageId}`, { replace: true })
  }

  const goPrev = () => currentIndex > 0 && goTo(sortedPages[currentIndex - 1].id)
  const goNext = () => currentIndex < sortedPages.length - 1 && goTo(sortedPages[currentIndex + 1].id)

  return (
    <div className="viewer-page">
      {/* Inga sammanhängande verktygsfält – varje kontroll är sin egen flytande knapp direkt
         ovanpå ritningen, så den aldrig tar permanent plats eller känns som en app-bar. */}
      <button
        className="viewer-float-btn back"
        onClick={() => navigate(`/project/${projectId}`)}
        aria-label="Tillbaka till projekt"
      >
        ✕
      </button>
      <div className="viewer-level-pill">
        <LevelNameEditor
          key={currentPage.id}
          projectId={projectId!}
          drawingPage={currentPage}
          level={currentPage.levelId ? levelById.get(currentPage.levelId) ?? null : null}
        />
        <span className="viewer-page-count">
          Sida {currentIndex + 1} av {sortedPages.length}
          {rooms && rooms.length > 0 && ` · ${completedRoomIds.size}/${rooms.length} rum klara`}
        </span>
      </div>
      <div className="viewer-float-group top-right">
        <button
          className="viewer-float-btn"
          onClick={() => setFilterSheetOpen(true)}
          aria-label={filterTag ? `Färgfilter: ${filterTag.code}` : 'Färglägg efter materialtagg'}
        >
          <FilterIcon width={20} height={20} />
          {filterTag && <span className="viewer-filter-dot" style={{ background: colorForValue(filterTag.code) }} />}
        </button>
        <button
          className="viewer-float-btn"
          onClick={() => setShowTagsOverview(true)}
          aria-label="Materialtaggar"
        >
          <TagIcon width={20} height={20} />
        </button>
        <button
          className="viewer-float-btn"
          onClick={() => setSidebarOpen((open) => !open)}
          aria-label="Visa/dölj sidor"
        >
          ▤
        </button>
      </div>

      <div className="viewer-body">
        <aside className={`viewer-sidebar${sidebarOpen ? '' : ' collapsed'}`}>
          {sortedPages.map((page) => (
            <button
              key={page.id}
              className={`viewer-thumb${page.id === currentPage.id ? ' active' : ''}`}
              onClick={() => goTo(page.id)}
            >
              {page.thumbnailDataUrl && <img src={page.thumbnailDataUrl} alt="" />}
              <span className="viewer-thumb-label">
                {page.levelId ? levelById.get(page.levelId)?.name ?? '–' : 'Ej tilldelad'}
              </span>
            </button>
          ))}
        </aside>

        <div className="viewer-main" ref={mainRef}>
          {currentIndex > 0 && (
            <button className="viewer-nav-btn prev tap-target" onClick={goPrev} aria-label="Föregående sida">
              ‹
            </button>
          )}
          {currentIndex < sortedPages.length - 1 && (
            <button className="viewer-nav-btn next tap-target" onClick={goNext} aria-label="Nästa sida">
              ›
            </button>
          )}
          {docError && <div className="viewer-empty">Ritningen kunde inte läsas in. {docError.message}</div>}
          {!doc && !docError && <div className="viewer-empty">Läser in ritning…</div>}
          {doc && mainSize && (
            <TransformWrapper
              key={currentPage.id}
              // Skala 1 = ritningen anpassad efter tillgängligt utrymme (se PdfPageCanvas), så
              // man alltid kan zooma ut till hela sidan och zooma in utan att det pixelerar.
              minScale={0.3}
              maxScale={PDF_MAX_ZOOM}
              centerOnInit
              // Annars zoomar varje scrollrörelse (mus-hjul eller styrplatta) i stället för att panorera,
              // vilket kändes hoppigt/förvirrande. Nu panorerar vanlig scroll, och pinch/ctrl+scroll zoomar.
              wheel={{ wheelDisabled: true }}
              trackPadPanning={{ disabled: false }}
              onTransform={(_, state) => setZoomScale(state.scale)}
            >
              <TransformComponent>
                <PdfPageCanvas
                  doc={doc}
                  pageIndex={currentPage.pageIndex}
                  containerSize={mainSize}
                  zoomScale={zoomScale}
                  rooms={rooms ?? []}
                  completedRoomIds={completedRoomIds}
                  highlightRoomIds={highlightRoomIds}
                  highlightColor={filterTag ? colorForValue(filterTag.code) : undefined}
                  onRoomTap={setSelectedRoom}
                  addMode={addRoomMode}
                  onCanvasTap={(x, y) => void handleCanvasTap(x, y)}
                />
              </TransformComponent>
            </TransformWrapper>
          )}
          <div className="viewer-toolbar">
            <button className="btn btn-secondary" onClick={handleDetectRooms} disabled={detecting}>
              {detecting ? 'Letar rum…' : `Hitta rum (${rooms?.length ?? 0})`}
            </button>
            <button
              className={`btn ${addRoomMode ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setAddRoomMode((on) => !on)}
            >
              {addRoomMode ? 'Tryck på ritningen…' : '+ Lägg till rum'}
            </button>
          </div>
        </div>
      </div>

      {selectedRoom && projectId && (
        <RoomInventorySheet room={selectedRoom} projectId={projectId} onClose={() => setSelectedRoom(null)} />
      )}
      {filterSheetOpen && (
        <TagColorFilterSheet
          tags={tags ?? []}
          selectedTagId={filterTagId}
          onSelect={setFilterTagId}
          onClose={() => setFilterSheetOpen(false)}
        />
      )}
      {showTagsOverview && projectId && (
        <TagsOverviewPanel projectId={projectId} onClose={() => setShowTagsOverview(false)} />
      )}
    </div>
  )
}

function sortPages(pages: DrawingPage[] | undefined, levels: Level[] | undefined): DrawingPage[] {
  if (!pages) return []
  const orderByLevelId = new Map((levels ?? []).map((l) => [l.id, l.order]))
  return [...pages].sort((a, b) => {
    const orderA = a.levelId ? orderByLevelId.get(a.levelId) ?? Infinity : Infinity
    const orderB = b.levelId ? orderByLevelId.get(b.levelId) ?? Infinity : Infinity
    if (orderA !== orderB) return orderB - orderA // högre plan överst, som i sketchens nivålista
    return a.pageIndex - b.pageIndex
  })
}

function LevelNameEditor({
  projectId,
  drawingPage,
  level,
}: {
  projectId: string
  drawingPage: DrawingPage
  level: Level | null
}) {
  const [name, setName] = useState(level?.name ?? '')

  const status = useAutosave(
    name,
    async (value) => {
      const trimmed = value.trim()
      if (!trimmed) return

      if (level) {
        await db.levels.update(level.id, { name: trimmed })
        return
      }

      // Återanvänd en befintlig nivå med samma namn istället för att alltid skapa en ny – annars
      // kan man råka skapa dubbletter av t.ex. "PLAN 7" om flera sidor saknar nivå samtidigt.
      await db.transaction('rw', [db.levels, db.drawingPages, db.rooms], async () => {
        const existingLevels = await db.levels.where('projectId').equals(projectId).toArray()
        let target = existingLevels.find((l) => l.name.toLowerCase() === trimmed.toLowerCase())

        if (!target) {
          const numericMatch = trimmed.match(/\d+/)
          target = {
            id: createId(),
            projectId,
            name: trimmed,
            order: numericMatch ? parseInt(numericMatch[0], 10) : existingLevels.length,
          }
          await db.levels.add(target)
        }

        await db.drawingPages.update(drawingPage.id, { levelId: target.id })
        // Rum som redan upptäckts på sidan innan nivån fanns pekade på levelId: null – utan den
        // här uppdateringen skulle de tappa bort nivåkopplingen i t.ex. Excel-exporten.
        await db.rooms.where('drawingPageId').equals(drawingPage.id).modify({ levelId: target.id })
      })
    },
    700,
  )

  return (
    <>
      <input
        className="viewer-level-name"
        value={name}
        placeholder="Namnge nivå…"
        onChange={(e) => setName(e.target.value)}
      />
      <span className="viewer-page-count">{STATUS_LABEL[status]}</span>
    </>
  )
}
