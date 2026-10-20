import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { db, createId, type DrawingPage, type Level } from '../db'
import { useAutosave, type SaveStatus } from '../hooks/useAutosave'
import { usePdfDocument } from '../features/pdf/usePdfDocument'
import { PdfPageCanvas } from '../features/pdf/PdfPageCanvas'

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Sparar…',
  saved: 'Sparat',
  error: 'Kunde inte spara',
}

export default function DrawingViewerPage() {
  const { projectId, drawingPageId } = useParams<{ projectId: string; drawingPageId: string }>()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const pages = useLiveQuery(
    () => db.drawingPages.where('projectId').equals(projectId ?? '').toArray(),
    [projectId],
  )
  const levels = useLiveQuery(() => db.levels.where('projectId').equals(projectId ?? '').toArray(), [projectId])

  const sortedPages = useMemo(() => sortPages(pages, levels), [pages, levels])
  const levelById = useMemo(() => new Map((levels ?? []).map((l) => [l.id, l])), [levels])

  const currentIndex = sortedPages.findIndex((p) => p.id === drawingPageId)
  const currentPage = currentIndex >= 0 ? sortedPages[currentIndex] : null
  const { doc } = usePdfDocument(currentPage?.drawingId ?? null)

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
        <header className="viewer-header">
          <button className="btn btn-ghost tap-target" onClick={() => navigate(`/project/${projectId}`)}>
            ← Tillbaka
          </button>
        </header>
        <div className="viewer-empty">Ritningen kunde inte hittas.</div>
      </div>
    )
  }

  function goTo(pageId: string) {
    navigate(`/project/${projectId}/viewer/${pageId}`, { replace: true })
  }

  const goPrev = () => currentIndex > 0 && goTo(sortedPages[currentIndex - 1].id)
  const goNext = () => currentIndex < sortedPages.length - 1 && goTo(sortedPages[currentIndex + 1].id)

  return (
    <div className="viewer-page">
      <header className="viewer-header">
        <button
          className="btn btn-ghost tap-target"
          onClick={() => navigate(`/project/${projectId}`)}
          aria-label="Tillbaka till projekt"
        >
          ✕
        </button>
        <div className="viewer-header-title">
          <LevelNameEditor
            key={currentPage.id}
            projectId={projectId!}
            drawingPage={currentPage}
            level={currentPage.levelId ? levelById.get(currentPage.levelId) ?? null : null}
          />
          <span className="viewer-page-count">
            Sida {currentIndex + 1} av {sortedPages.length}
          </span>
        </div>
        <button
          className="btn btn-ghost tap-target"
          onClick={() => setSidebarOpen((open) => !open)}
          aria-label="Visa/dölj sidor"
        >
          ▤
        </button>
      </header>

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

        <div className="viewer-main">
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
          {doc && (
            <TransformWrapper
              key={currentPage.id}
              minScale={0.5}
              maxScale={8}
              centerOnInit
              // Annars zoomar varje scrollrörelse (mus-hjul eller styrplatta) i stället för att panorera,
              // vilket kändes hoppigt/förvirrande. Nu panorerar vanlig scroll, och pinch/ctrl+scroll zoomar.
              wheel={{ wheelDisabled: true }}
              trackPadPanning={{ disabled: false }}
            >
              <TransformComponent>
                <PdfPageCanvas doc={doc} pageIndex={currentPage.pageIndex} />
              </TransformComponent>
            </TransformWrapper>
          )}
        </div>
      </div>
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
      } else {
        const newLevel: Level = {
          id: createId(),
          projectId,
          name: trimmed,
          order: 0,
        }
        await db.levels.add(newLevel)
        await db.drawingPages.update(drawingPage.id, { levelId: newLevel.id })
      }
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
