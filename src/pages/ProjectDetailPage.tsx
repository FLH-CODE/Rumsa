import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../db'
import { useAutosave, type SaveStatus } from '../hooks/useAutosave'
import { importDrawingFile } from '../features/pdf/importDrawing'
import { deleteProjectCascade, deleteDrawingCascade } from '../features/data/cascadeDelete'
import { ROOM_NUMBER_PRESETS } from '../features/project/roomNumberPresets'

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Sparar…',
  saved: 'Sparat',
  error: 'Kunde inte spara',
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
  const roomCount = useLiveQuery(
    () => db.rooms.where('projectId').equals(projectId ?? '').count(),
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
      !confirm(
        `Ta bort ritningen "${fileName}"? Rum och inventering som hör till dess sidor tas bort permanent.`,
      )
    ) {
      return
    }
    await deleteDrawingCascade(drawingId)
  }

  const handlePatternChange = async (pattern: string) => {
    if (!projectId) return
    await db.projects.update(projectId, { roomNumberPattern: pattern, updatedAt: Date.now() })
  }

  return (
    <>
      <header className="app-header">
        <button className="btn-ghost btn tap-target" onClick={() => navigate('/')} aria-label="Tillbaka">
          ← Projekt
        </button>
        <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>{STATUS_LABEL[status]}</span>
      </header>
      <main className="app-main">
        <div className="field" style={{ marginBottom: 20 }}>
          <label htmlFor="project-name">Projektnamn</label>
          <input
            id="project-name"
            value={name ?? ''}
            onChange={(e) => {
              setNameTouched(true)
              setName(e.target.value)
            }}
          />
        </div>

        <section className="card" style={{ marginBottom: 12 }}>
          <strong>Inställningar</strong>
          <div className="field" style={{ marginTop: 10 }}>
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

        <section className="card" style={{ marginBottom: 12 }}>
          <strong>Ritningar</strong>
          <p className="field-hint">
            Ladda upp en eller flera PDF-ritningar. Nivå ("PLAN XX") tolkas automatiskt – går att döpa om i
            visaren.
          </p>
          <div className="upload-row">
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
              disabled={importState.busy}
              onClick={() => fileInputRef.current?.click()}
            >
              {importState.busy ? 'Läser in…' : 'Ladda upp ritning(ar)'}
            </button>
            {firstPage && (
              <button className="btn btn-primary" onClick={() => navigate(`/project/${projectId}/viewer/${firstPage.id}`)}>
                Öppna ritningsvisare
              </button>
            )}
          </div>
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
                  <span>{d.pageCount} sidor</span>
                  <button
                    className="drawing-delete-btn tap-target"
                    aria-label={`Ta bort ${d.fileName}`}
                    onClick={() => void handleDeleteDrawing(d.id, d.fileName)}
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card" style={{ marginBottom: 12 }}>
          <strong>Rum</strong>
          <p className="field-hint">
            {roomCount
              ? `${roomCount} rum hittade. Öppna ritningsvisaren och tryck på en rumstagg för att inventera.`
              : 'Rumstaggar tolkas automatiskt när en ritning laddas upp.'}
          </p>
        </section>

        <section className="card" style={{ marginBottom: 12 }}>
          <strong>Export</strong>
          <p className="field-hint">Exportera all inventerad data till Excel.</p>
          <button
            className="btn btn-secondary"
            onClick={handleExport}
            disabled={exporting || !roomCount}
          >
            {exporting ? 'Exporterar…' : 'Exportera till Excel'}
          </button>
          {exportError && (
            <p className="field-hint" style={{ color: 'var(--color-danger)' }}>
              {exportError}
            </p>
          )}
        </section>

        <button
          className="btn"
          style={{ color: 'var(--color-danger)', marginTop: 24 }}
          onClick={handleDelete}
        >
          Ta bort projekt
        </button>
      </main>
    </>
  )
}
