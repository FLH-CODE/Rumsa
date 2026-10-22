import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../db'
import { useAutosave } from '../hooks/useAutosave'
import { importDrawingFile } from '../features/pdf/importDrawing'
import { deleteProjectCascade, deleteDrawingCascade } from '../features/data/cascadeDelete'
import { ROOM_NUMBER_PRESETS } from '../features/project/roomNumberPresets'
import { DrawingIcon, ExportIcon, SettingsIcon, TagIcon, TrashIcon, ChevronRightIcon } from '../components/icons'

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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const drawings = useLiveQuery(
    () => db.drawings.where('projectId').equals(projectId ?? '').toArray(),
    [projectId],
  )
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
  const roomIdsKey = (rooms ?? []).map((r) => r.id).join(',')
  const records = useLiveQuery(
    () => db.inventoryRecords.where('roomId').anyOf(roomIdsKey ? roomIdsKey.split(',') : []).toArray(),
    [roomIdsKey],
  )
  const completedCount = (records ?? []).filter((r) =>
    r.rows.some((row) => row.rivning.trim() || row.materials.length > 0 || row.ovrigt.trim()),
  ).length
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
    if (!confirm(`Ta bort projektet "${project.name}"? Detta går inte att ångra.`)) return
    await deleteProjectCascade(projectId)
    navigate('/')
  }

  const handleDeleteDrawing = async (drawingId: string, fileName: string) => {
    if (
      !confirm(`Ta bort ritningen "${fileName}"? Rum och inventering som hör till dess sidor tas bort permanent.`)
    ) {
      return
    }
    await deleteDrawingCascade(drawingId)
  }

  const handlePatternChange = async (pattern: string) => {
    if (!projectId) return
    await db.projects.update(projectId, { roomNumberPattern: pattern, updatedAt: Date.now() })
  }

  const roomCount = rooms?.length ?? 0
  const progressPct = roomCount > 0 ? Math.round((completedCount / roomCount) * 100) : 0
  const currentPatternLabel =
    ROOM_NUMBER_PRESETS.find((p) => p.value === project.roomNumberPattern)?.shortLabel ?? 'Anpassat'

  return (
    <>
      <header className="app-header">
        <button className="btn-ghost btn tap-target" onClick={() => navigate('/')} aria-label="Tillbaka">
          ←
        </button>
        <input
          className="header-title-input"
          value={name ?? ''}
          aria-label="Projektnamn"
          onChange={(e) => {
            setNameTouched(true)
            setName(e.target.value)
          }}
        />
        <span className="save-dot" data-status={status} aria-hidden="true" />
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
            <DrawingIcon width={26} height={26} />
          </div>
          <div className="primary-action-text">
            <strong>{firstPage ? 'Öppna ritningsvisare' : 'Ladda upp en ritning för att börja'}</strong>
            {roomCount > 0 ? (
              <div className="progress-row">
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progressPct}%` }} />
                </div>
                <span className="field-hint">
                  {completedCount}/{roomCount} rum klara
                </span>
              </div>
            ) : (
              <span className="field-hint">
                {firstPage ? 'Rumstaggar tolkas automatiskt ur ritningen' : 'PDF-ritning med rumstaggar'}
              </span>
            )}
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
                <div key={d.id} className="drawing-list-item">
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
              ))}
            </div>
          )}
        </section>

        <nav className="settings-list">
          <button
            className="settings-list-item"
            onClick={() => navigate(`/project/${projectId}/tags`)}
            aria-label={`Materialtaggar, ${tagCount ?? 0} st`}
          >
            <TagIcon className="settings-list-icon" />
            <span className="settings-list-label">Materialtaggar</span>
            <span className="settings-list-value">{tagCount ?? 0}</span>
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
                onChange={(e) => void handlePatternChange(e.target.value)}
              >
                {ROOM_NUMBER_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                Styr hur appen känner igen rumsnummer. Redan uppladdade ritningar uppdateras inte automatiskt –
                tryck "Hitta rum" igen i visaren efter en ändring.
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
