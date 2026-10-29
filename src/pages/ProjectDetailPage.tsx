import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db, type DrawingPage, type Level } from '../db'
import { useAutosave } from '../hooks/useAutosave'
import { importDrawingFile } from '../features/pdf/importDrawing'
import { syncRoomsForPage } from '../features/pdf/syncRooms'
import { renameOrAssignLevel } from '../features/pdf/levelAssignment'
import { pdfjsLib } from '../pdf/pdfjsSetup'
import { deleteProjectCascade, deleteDrawingCascade } from '../features/data/cascadeDelete'
import { ROOM_NUMBER_PRESETS } from '../features/project/roomNumberPresets'
import { confirmDialog } from '../components/ConfirmDialog'
import { FullscreenButton } from '../components/FullscreenButton'
import { blurOnEnterEscape } from '../utils/keyboardShortcuts'
import {
  FloorPlanIcon,
  DrawingIcon,
  ExportIcon,
  SettingsIcon,
  TagIcon,
  TrashIcon,
  ChevronRightIcon,
  LinkIcon,
  BackIcon,
} from '../components/icons'

/** Format-byten som är garanterat säkra även efter att ritningar laddats upp: målformatet är en
 * strikt superset av källformatet (samma siffer-del, men suffixet är valfritt/vidare), så ett
 * rumsnummer som redan matchade källformatet matchar alltid målformatet också – se
 * hasUploadedDrawings-kommentaren nedan för varför det annars är låst. */
const SAFE_PATTERN_UPGRADES: Record<string, string[]> = {
  '^\\d{3,4}$': ['^\\d{3,4}[A-ZÅÄÖ]{0,4}$'],
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const project = useLiveQuery(() => (projectId ? db.projects.get(projectId) : undefined), [projectId])
  // null = projektet är inte inläst än. Skiljer "väntar på data" från ett medvetet tomt namn,
  // så att inläsningen av det riktiga namnet inte räknas som en användarredigering och triggar
  // ett onödigt sparande (som annars skulle putta upp projektet överst i listan vid varje öppning).
  const [name, setName] = useState<string | null>(null)
  const [nameTouched, setNameTouched] = useState(false)
  const [importState, setImportState] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  })
  const [showSettings, setShowSettings] = useState(false)
  const [redetecting, setRedetecting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const drawings = useLiveQuery(
    () => db.drawings.where('projectId').equals(projectId ?? '').toArray(),
    [projectId],
  )
  const drawingPages = useLiveQuery(
    () => db.drawingPages.where('projectId').equals(projectId ?? '').toArray(),
    [projectId],
  )
  const levels = useLiveQuery(() => db.levels.where('projectId').equals(projectId ?? '').toArray(), [projectId])
  const firstPage = useLiveQuery(
    () =>
      db.drawingPages
        .where('projectId')
        .equals(projectId ?? '')
        .sortBy('pageIndex')
        .then((p) => p[0]),
    [projectId],
  )
  const rooms = useLiveQuery(() => db.rooms.where('projectId').equals(projectId ?? '').toArray(), [projectId])
  const tagCount = useLiveQuery(
    () => db.materialTags.where('projectId').equals(projectId ?? '').count(),
    [projectId],
  )

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const status = useAutosave(
    name,
    async (value) => {
      if (!projectId || !value?.trim()) return
      await db.projects.update(projectId, { name: value.trim(), updatedAt: Date.now() })
    },
    600,
  )

  useEffect(() => {
    if (project && !nameTouched) {
      setName(project.name)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  if (!project) {
    return (
      <main className="app-main">
        <p>Laddar…</p>
      </main>
    )
  }

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0 || !projectId) return
    setImportState({ busy: true, error: null })
    try {
      for (const file of Array.from(files)) {
        await importDrawingFile(projectId, file)
      }
      setImportState({ busy: false, error: null })
    } catch (err) {
      setImportState({ busy: false, error: err instanceof Error ? err.message : 'Okänt fel vid import.' })
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleExport = async () => {
    if (!project) return
    setExporting(true)
    setExportError(null)
    try {
      // Laddas bara in när man faktiskt exporterar – xlsx är tungt och behövs inte i grundappen.
      const { exportProjectToExcel } = await import('../features/export/exportProjectToExcel')
      await exportProjectToExcel(project)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Okänt fel vid export.')
    } finally {
      setExporting(false)
    }
  }

  const handleDelete = async () => {
    if (!projectId) return
    const confirmed = await confirmDialog(`Ta bort projektet "${project.name}"? Detta går inte att ångra.`, { danger: true })
    if (!confirmed) return
    await deleteProjectCascade(projectId)
    navigate('/')
  }

  const handleDeleteDrawing = async (drawingId: string, fileName: string) => {
    const confirmed = await confirmDialog(
      `Ta bort ritningen "${fileName}"? Rum och inventering som hör till dess sidor tas bort permanent.`,
      { danger: true },
    )
    if (!confirmed) return
    await deleteDrawingCascade(drawingId)
  }

  const handlePatternChange = async (pattern: string) => {
    if (!projectId) return
    await db.projects.update(projectId, { roomNumberPattern: pattern, updatedAt: Date.now() })

    // Körs om automatiskt istället för att kräva ett manuellt tryck på "Hitta rum" i visaren –
    // annars skulle redan uppladdade ritningar tyst fortsätta använda det gamla formatet.
    setRedetecting(true)
    try {
      const pages = await db.drawingPages.where('projectId').equals(projectId).toArray()
      const pagesByDrawing = new Map<string, typeof pages>()
      for (const page of pages) {
        const group = pagesByDrawing.get(page.drawingId)
        if (group) group.push(page)
        else pagesByDrawing.set(page.drawingId, [page])
      }
      for (const [drawingId, drawingPages] of pagesByDrawing) {
        const drawing = await db.drawings.get(drawingId)
        if (!drawing) continue
        const buffer = await drawing.pdfBlob.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
        for (const drawingPage of drawingPages) {
          const page = await pdf.getPage(drawingPage.pageIndex + 1)
          await syncRoomsForPage(page, drawingPage, pattern)
        }
      }
    } finally {
      setRedetecting(false)
    }
  }

  const roomCount = rooms?.length ?? 0
  // Att byta format efter att ritningar laddats upp (och därmed redan rumstaggade via det gamla
  // formatet) skulle göra att redan taggade rum inte längre matchas vid nästa omdetektering –
  // se handlePatternChange/syncRoomsForPage – och i praktiken förstöra allt ifyllt arbete. Ett
  // UNDANTAG: att byta till ett strikt BREDARE format (se SAFE_PATTERN_UPGRADES) är ofarligt,
  // eftersom varje rumsnummer som redan matchade det smalare formatet garanterat matchar det
  // bredare också – bytet kan då bara upptäcka nya rum, aldrig tappa bort befintliga.
  const hasUploadedDrawings = (drawings?.length ?? 0) > 0
  const safeUpgradeTargets = SAFE_PATTERN_UPGRADES[project.roomNumberPattern] ?? []
  const currentPatternLabel =
    ROOM_NUMBER_PRESETS.find((p) => p.value === project.roomNumberPattern)?.shortLabel ?? 'Anpassat'

  return (
    <>
      <header className="app-header">
        <button className="btn-ghost btn tap-target" onClick={() => navigate('/')} aria-label="Tillbaka">
          <BackIcon width={20} height={20} />
        </button>
        <input
          className="header-title-input"
          value={name ?? ''}
          aria-label="Projektnamn"
          enterKeyHint="done"
          onChange={(e) => {
            setNameTouched(true)
            setName(e.target.value)
          }}
        />
        <span className="save-dot" data-status={status} aria-hidden="true" />
        <FullscreenButton />
      </header>
      <main className="app-main project-detail">
        <button
          className="primary-action-card"
          onClick={() =>
            firstPage
              ? navigate(`/project/${projectId}/viewer/${firstPage.id}`)
              : fileInputRef.current?.click()
          }
        >
          <div className="primary-action-icon">
            <FloorPlanIcon width={44} height={44} />
          </div>
          <div className="primary-action-text">
            <strong>{firstPage ? 'Öppna ritningsvisare' : 'Ladda upp en ritning för att börja'}</strong>
            {!firstPage && <span className="field-hint">PDF-ritning med rumstaggar</span>}
          </div>
          <ChevronRightIcon className="primary-action-chevron" />
        </button>

        <section className="card" style={{ marginBottom: 16 }}>
          <div className="section-heading">
            <DrawingIcon width={18} height={18} />
            <strong>Ritningar</strong>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            id="drawing-upload"
            style={{ display: 'none' }}
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
          <button
            className="btn btn-secondary"
            style={{ marginTop: 10 }}
            disabled={importState.busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {importState.busy ? 'Läser in…' : '+ Ladda upp ritning(ar)'}
          </button>
          {importState.error && (
            <p className="field-hint" style={{ color: 'var(--color-danger)' }}>
              {importState.error}
            </p>
          )}
          {drawings && drawings.length > 0 && (
            <div className="drawing-list">
              {drawings.map((d) => (
                <div key={d.id} className="drawing-group">
                  <div className="drawing-list-item">
                    <span>{d.fileName}</span>
                    <span className="field-hint">{d.pageCount} sidor</span>
                    <button
                      className="drawing-delete-btn tap-target"
                      aria-label={`Ta bort ${d.fileName}`}
                      onClick={() => void handleDeleteDrawing(d.id, d.fileName)}
                    >
                      <TrashIcon width={16} height={16} />
                    </button>
                  </div>
                  <div className="drawing-page-list">
                    {(drawingPages ?? [])
                      .filter((p) => p.drawingId === d.id)
                      .sort((a, b) => a.pageIndex - b.pageIndex)
                      .map((page) => (
                        <DrawingPageLevelRow
                          key={page.id}
                          projectId={projectId!}
                          page={page}
                          level={(levels ?? []).find((l) => l.id === page.levelId) ?? null}
                        />
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <nav className="settings-list">
          <button
            className="settings-list-item"
            onClick={() => navigate(`/project/${projectId}/tags`)}
            aria-label={`Material och inventarier, ${tagCount ?? 0} st`}
          >
            <TagIcon className="settings-list-icon" />
            <span className="settings-list-label">Material och inventarier</span>
            <span className="settings-list-value">{tagCount ?? 0}</span>
            <ChevronRightIcon className="settings-list-chevron" />
          </button>
          <button
            className="settings-list-item"
            onClick={() => navigate(`/project/${projectId}/room-types`)}
            aria-label="Typrum"
          >
            <LinkIcon className="settings-list-icon" />
            <span className="settings-list-label">Typrum</span>
            <ChevronRightIcon className="settings-list-chevron" />
          </button>
          <button
            className="settings-list-item"
            onClick={() => void handleExport()}
            disabled={exporting || !roomCount}
            aria-label={exporting ? 'Exporterar…' : 'Exportera till Excel'}
          >
            <ExportIcon className="settings-list-icon" />
            <span className="settings-list-label">{exporting ? 'Exporterar…' : 'Exportera till Excel'}</span>
            <ChevronRightIcon className="settings-list-chevron" />
          </button>
          <button
            className="settings-list-item"
            onClick={() => setShowSettings((s) => !s)}
            aria-expanded={showSettings}
            aria-label={`Rumsnummerformat, ${currentPatternLabel}`}
          >
            <SettingsIcon className="settings-list-icon" />
            <span className="settings-list-label">Rumsnummerformat</span>
            <span className="settings-list-value">{currentPatternLabel}</span>
            <ChevronRightIcon className={`settings-list-chevron${showSettings ? ' open' : ''}`} />
          </button>
        </nav>
        {exportError && (
          <p className="field-hint" style={{ color: 'var(--color-danger)', marginTop: -8 }}>
            {exportError}
          </p>
        )}

        {showSettings && (
          <section className="card" style={{ marginTop: 12 }}>
            <div className="field">
              <label htmlFor="room-pattern">Rumsnummerformat i ritningarna</label>
              <select
                id="room-pattern"
                value={project.roomNumberPattern}
                disabled={redetecting}
                onChange={(e) => void handlePatternChange(e.target.value)}
              >
                {ROOM_NUMBER_PRESETS.map((p) => {
                  const isCurrent = p.value === project.roomNumberPattern
                  const locked = hasUploadedDrawings && !isCurrent && !safeUpgradeTargets.includes(p.value)
                  return (
                    <option key={p.value} value={p.value} disabled={locked}>
                      {p.label}
                      {locked ? ' (låst)' : ''}
                    </option>
                  )
                })}
              </select>
              <span className="field-hint">
                {redetecting
                  ? 'Söker igenom uppladdade ritningar efter det nya formatet…'
                  : hasUploadedDrawings
                    ? safeUpgradeTargets.length > 0
                      ? 'Redan taggade rum påverkas inte av att byta till ett bredare format – det kan bara hitta nya rum, aldrig tappa bort befintliga. Övriga format (låst) skulle kunna göra det och går därför inte att välja.'
                      : 'Går inte att ändra efter att ritningar laddats upp – ett annat format skulle göra att redan taggade rum inte längre känns igen och förstöra det ifyllda arbetet.'
                    : 'Styr hur appen känner igen rumsnummer. Uppdaterar automatiskt alla uppladdade ritningar vid ändring.'}
              </span>
            </div>
          </section>
        )}

        <button className="danger-link" onClick={() => void handleDelete()}>
          Ta bort projekt
        </button>
      </main>
    </>
  )
}

/** En rads namn-på-nivå-fält för en enskild ritningssida – samma spara-logik (döp om delad nivå,
 * eller skapa/återanvänd + koppla) som "Namnge nivå"-dialogen i ritningsvisaren (se
 * renameOrAssignLevel), bara alltid synligt/redigerbart direkt i listan istället för bakom en
 * egen dialog man måste öppna sidan för sidan. */
function DrawingPageLevelRow({
  projectId,
  page,
  level,
}: {
  projectId: string
  page: DrawingPage
  level: Level | null
}) {
  const [name, setName] = useState(level?.name ?? '')
  // Släpar efter en extern ändring (t.ex. via visarens egen dialog) bara medan man faktiskt skriver
  // i fältet själv – annars skulle en redan pågående redigering kunna bli överskriven under en.
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!touched) setName(level?.name ?? '')
  }, [level?.name, touched])

  const commit = async () => {
    setTouched(false)
    const trimmed = name.trim()
    // Tomt fält sparas inte – det skulle annars kunna tömma ett nivånamn som delas av flera sidor
    // bara för att man råkade radera texten och klicka bort utan att ångra sig.
    if (!trimmed || trimmed === (level?.name ?? '')) return
    await renameOrAssignLevel(projectId, page.id, level?.id ?? null, trimmed)
  }

  return (
    <div className="drawing-page-row">
      <span className="field-hint">Sida {page.pageIndex + 1}</span>
      <input
        className="drawing-page-level-input"
        value={name}
        placeholder="Namnge nivå…"
        enterKeyHint="done"
        onChange={(e) => {
          setTouched(true)
          setName(e.target.value)
        }}
        onBlur={() => void commit()}
        onKeyDown={blurOnEnterEscape}
      />
    </div>
  )
}
