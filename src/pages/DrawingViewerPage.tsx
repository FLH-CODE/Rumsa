import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { db, createId, type DrawingPage, type Level, type Room } from '../db'
import { useElementSize } from '../hooks/useElementSize'
import { usePdfDocument } from '../features/pdf/usePdfDocument'
import { PdfPageCanvas, PDF_MAX_ZOOM } from '../features/pdf/PdfPageCanvas'
import { TagColorFilterSheet } from '../features/pdf/TagColorFilterSheet'
import { getViewerPosition, setViewerPosition } from '../features/pdf/viewerPositionStore'
import { RoomInventorySheet } from '../features/inventory/RoomInventorySheet'
import { isRecordStarted } from '../features/inventory/recordStatus'
import { TagsOverviewPanel } from '../features/tags/TagsOverviewPanel'
import { colorForValue } from '../features/tags/colorForValue'
import { TagIcon, FilterIcon, HomeIcon, ChevronRightIcon, FullscreenEnterIcon, FullscreenExitIcon } from '../components/icons'
import { confirmOnEnterEscape } from '../utils/keyboardShortcuts'

export default function DrawingViewerPage() {
  const { projectId, drawingPageId } = useParams<{ projectId: string; drawingPageId: string }>()
  const navigate = useNavigate()
  // Öppen som standard på bredare skärmar, stängd på mobil där panelen annars tar en stor del
  // av en redan liten yta.
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 640)
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [addRoomMode, setAddRoomMode] = useState(false)
  // Måste matcha den sparade positionens skala direkt vid montering (inte bara 1) – annars
  // räknar rumstaggarnas motskalning mot fel zoomnivå under den korta stund innan en faktisk
  // pan/zoom-interaktion hinner uppdatera värdet, vilket gjorde dem jättestora när man öppnade
  // visaren på en sida som senast var inzoomad.
  const [zoomScale, setZoomScale] = useState(() => getViewerPosition(drawingPageId ?? '')?.scale ?? 1)
  const [mainRef, mainSize] = useElementSize<HTMLDivElement>()
  const [showTagsOverview, setShowTagsOverview] = useState(false)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [filterTagId, setFilterTagId] = useState<string | null>(null)
  const [renamingLevel, setRenamingLevel] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement))
  const pageSortSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // Manifestets display:"fullscreen" gäller bara en genväg man lagt till på hemskärmen – i en
  // vanlig öppen webbläsarflik (som den man ser i en vanlig Chrome-flik) går det inte att dölja
  // adressfältet utan att användaren själv aktivt begär helskärm, därav knappen. Lyssnar på
  // fullscreenchange också, så ikonen stämmer om man lämnar helskärm med Esc/systemets tillbaka.
  useEffect(() => {
    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handleChange)
    return () => document.removeEventListener('fullscreenchange', handleChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void document.documentElement.requestFullscreen().catch(() => {
        // Vissa webbläsare (t.ex. iOS Safari) saknar stöd för Fullscreen API helt – då finns
        // ingen bättre reserv än att låta adressfältet synas kvar.
      })
    }
  }

  const pages = useLiveQuery(
    () => db.drawingPages.where('projectId').equals(projectId ?? '').toArray(),
    [projectId],
  )
  const levels = useLiveQuery(() => db.levels.where('projectId').equals(projectId ?? '').toArray(), [projectId])

  const sortedPages = useMemo(() => sortPages(pages, levels), [pages, levels])
  const levelById = useMemo(() => new Map((levels ?? []).map((l) => [l.id, l])), [levels])

  const currentIndex = sortedPages.findIndex((p) => p.id === drawingPageId)
  const currentPage = currentIndex >= 0 ? sortedPages[currentIndex] : null
  const viewerPosition = currentPage ? getViewerPosition(currentPage.id) : undefined
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
      if (isRecordStarted(record)) {
        set.add(record.roomId)
      }
    }
    // Ett rum kopplat till ett typrum räknas alltid som klart – det ärver all sin data därifrån,
    // så dess egen (ev. tomma) inventeringspost säger inget om huruvida rummet är ifyllt.
    for (const room of rooms ?? []) {
      if (room.roomTypeId) set.add(room.id)
    }
    return set
  }, [records, rooms])

  const tags = useLiveQuery(
    () => db.materialTags.where('projectId').equals(projectId ?? '').sortBy('code'),
    [projectId],
  )
  const filterTag = tags?.find((t) => t.id === filterTagId) ?? null
  const highlightRoomIds = useMemo(() => {
    if (!filterTagId) return null
    const set = new Set<string>()
    for (const record of records ?? []) {
      if (Object.values(record.categories).some((entry) => entry.materials.some((m) => m.tagId === filterTagId))) {
        set.add(record.roomId)
      }
    }
    return set
  }, [records, filterTagId])

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
      roomTypeId: null,
    }
    await db.rooms.add(newRoom)
    setSelectedRoom(newRoom)
  }

  // Skriver om hela listans `order` 0..N-1 efter en dragning – enklast robusta sättet att undvika
  // kollisioner mellan befintliga värden istället för att försöka klämma in ett nytt värde mellan
  // två grannar.
  const handlePageDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sortedPages.findIndex((p) => p.id === active.id)
    const newIndex = sortedPages.findIndex((p) => p.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(sortedPages, oldIndex, newIndex)
    await db.transaction('rw', db.drawingPages, async () => {
      await Promise.all(reordered.map((page, index) => db.drawingPages.update(page.id, { order: index })))
    })
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
        <div className="viewer-float-group top-right">
          <button
            className="viewer-float-btn"
            onClick={() => navigate(`/project/${projectId}`)}
            aria-label="Till projektet"
          >
            <HomeIcon width={20} height={20} />
          </button>
        </div>
        <div className="viewer-empty">Ritningen kunde inte hittas.</div>
      </div>
    )
  }

  function goTo(pageId: string) {
    setZoomScale(getViewerPosition(pageId)?.scale ?? 1)
    navigate(`/project/${projectId}/viewer/${pageId}`, { replace: true })
  }

  const goPrev = () => currentIndex > 0 && goTo(sortedPages[currentIndex - 1].id)
  const goNext = () => currentIndex < sortedPages.length - 1 && goTo(sortedPages[currentIndex + 1].id)

  // Hoppar direkt till ett annat rums kort (t.ex. från taggöversiktens "Används i"-lista), även
  // om rummet sitter på en annan sida än den man just nu tittar på.
  const handleOpenRoom = (targetRoom: Room) => {
    setShowTagsOverview(false)
    if (targetRoom.drawingPageId !== currentPage.id) {
      goTo(targetRoom.drawingPageId)
    }
    setSelectedRoom(targetRoom)
  }

  const currentLevel = currentPage.levelId ? levelById.get(currentPage.levelId) ?? null : null

  return (
    <div className="viewer-page">
      {/* Inga sammanhängande verktygsfält – varje kontroll är sin egen flytande knapp direkt
         ovanpå ritningen, så den aldrig tar permanent plats eller känns som en app-bar. */}
      <button
        type="button"
        className="viewer-level-pill"
        onClick={() => setRenamingLevel(true)}
        aria-label={`Namnge nivå, nuvarande namn: ${currentLevel?.name || 'inget'}`}
      >
        <strong className="viewer-level-name">{currentLevel?.name || 'Namnge nivå…'}</strong>
        <span className="viewer-page-count">
          Sida {currentIndex + 1} av {sortedPages.length}
          {rooms && rooms.length > 0 && ` · ${completedRoomIds.size}/${rooms.length} rum klara`}
        </span>
      </button>
      <div className="viewer-float-group top-right">
        <button
          className="viewer-float-btn"
          onClick={() => navigate(`/project/${projectId}`)}
          aria-label="Till projektet"
        >
          <HomeIcon width={20} height={20} />
        </button>
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
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Avsluta helskärm' : 'Helskärm'}
        >
          {isFullscreen ? <FullscreenExitIcon width={20} height={20} /> : <FullscreenEnterIcon width={20} height={20} />}
        </button>
      </div>
      {/* Flik i vänsterkanten, som ett bokmärke man drar ut/in – istället för en knapp bland de
         andra, så den tydligt hör ihop med sidlistan den styr. Pilen pekar åt det håll listan
         öppnas/stängs. */}
      <button
        className={`viewer-sidebar-tab${sidebarOpen ? ' open' : ''}`}
        onClick={() => setSidebarOpen((open) => !open)}
        aria-label={sidebarOpen ? 'Dölj sidöversikt' : 'Visa sidöversikt'}
      >
        <ChevronRightIcon width={18} height={18} />
      </button>
      {renamingLevel && (
        <LevelRenameSheet
          projectId={projectId!}
          drawingPage={currentPage}
          level={currentLevel}
          onClose={() => setRenamingLevel(false)}
        />
      )}

      <div className="viewer-body">
        <aside className={`viewer-sidebar${sidebarOpen ? '' : ' collapsed'}`}>
          <DndContext sensors={pageSortSensors} collisionDetection={closestCenter} onDragEnd={(e) => void handlePageDragEnd(e)}>
            <SortableContext items={sortedPages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              {sortedPages.map((page) => (
                <SortableThumb
                  key={page.id}
                  page={page}
                  active={page.id === currentPage.id}
                  label={page.levelId ? levelById.get(page.levelId)?.name ?? '–' : 'Ej tilldelad'}
                  onSelect={() => goTo(page.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
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
              // Återställer senaste pan/zoom-läge för sidan om det finns sparat – annars centreras
              // sidan om varje gång man t.ex. stänger ett rumskort och kommer tillbaka.
              initialPositionX={viewerPosition?.positionX}
              initialPositionY={viewerPosition?.positionY}
              initialScale={viewerPosition?.scale}
              centerOnInit={!viewerPosition}
              // Annars zoomar varje scrollrörelse (mus-hjul eller styrplatta) i stället för att panorera,
              // vilket kändes hoppigt/förvirrande. Nu panorerar vanlig scroll, och pinch/ctrl+scroll zoomar.
              wheel={{ wheelDisabled: true }}
              trackPadPanning={{ disabled: false }}
              // Uppdaterar skalan (styr rumstaggarnas motskalning) och sparar undan pan/zoom-läget
              // per sida, men bara när det faktiskt ändrats mer än flyttalsbrus – annars triggar ren
              // panorering (ingen zoomändring) ändå en ny render per musrörelse.
              onTransform={(_, state) => {
                setZoomScale((prev) => (Math.abs(prev - state.scale) > 0.001 ? state.scale : prev))
                setViewerPosition(currentPage.id, {
                  positionX: state.positionX,
                  positionY: state.positionY,
                  scale: state.scale,
                })
              }}
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
        <RoomInventorySheet
          key={selectedRoom.id}
          room={selectedRoom}
          projectId={projectId}
          onClose={() => setSelectedRoom(null)}
        />
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
        <TagsOverviewPanel
          projectId={projectId}
          onClose={() => setShowTagsOverview(false)}
          onOpenRoom={handleOpenRoom}
        />
      )}
    </div>
  )
}

/** En enskild sida i sidlistan – dragbar (för att ändra ordning, se handlePageDragEnd) och
 * samtidigt klickbar (för att hoppa dit) i ett och samma element. */
function SortableThumb({
  page,
  active,
  label,
  onSelect,
}: {
  page: DrawingPage
  active: boolean
  label: string
  onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id })
  return (
    <button
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`viewer-thumb${active ? ' active' : ''}${isDragging ? ' dragging' : ''}`}
      onClick={onSelect}
      {...attributes}
      {...listeners}
    >
      {page.thumbnailDataUrl && <img src={page.thumbnailDataUrl} alt="" />}
      <span className="viewer-thumb-label">{label}</span>
    </button>
  )
}

function sortPages(pages: DrawingPage[] | undefined, levels: Level[] | undefined): DrawingPage[] {
  if (!pages) return []
  const orderByLevelId = new Map((levels ?? []).map((l) => [l.id, l.order]))
  return [...pages].sort((a, b) => {
    const orderA = a.levelId ? orderByLevelId.get(a.levelId) ?? Infinity : Infinity
    const orderB = b.levelId ? orderByLevelId.get(b.levelId) ?? Infinity : Infinity
    if (orderA !== orderB) return orderB - orderA // högre plan överst, som i sketchens nivålista
    return a.order - b.order
  })
}

/**
 * Namnge/döp om nivån för den aktuella sidan – ett enda ställe att göra det på (en tydlig dialog
 * man öppnar avsiktligt), istället för ett alltid-redigerbart fält som gick att råka trycka in
 * sig i av misstag utan en tydlig väg ut.
 */
function LevelRenameSheet({
  projectId,
  drawingPage,
  level,
  onClose,
}: {
  projectId: string
  drawingPage: DrawingPage
  level: Level | null
  onClose: () => void
}) {
  const [name, setName] = useState(level?.name ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true)
    try {
      if (level) {
        await db.levels.update(level.id, { name: trimmed })
      } else {
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
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Namnge nivå</h2>
        <div className="field">
          <label htmlFor="level-rename">Namn</label>
          <input
            id="level-rename"
            autoFocus
            enterKeyHint="done"
            value={name}
            placeholder="t.ex. Plan 1"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={confirmOnEnterEscape(() => void handleSave(), onClose)}
          />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Avbryt
          </button>
          <button className="btn btn-primary" onClick={() => void handleSave()} disabled={!name.trim() || saving}>
            {saving ? 'Sparar…' : 'Spara'}
          </button>
        </div>
      </div>
    </div>
  )
}
