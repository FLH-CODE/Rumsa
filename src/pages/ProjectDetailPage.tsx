import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../db'
import { useAutosave, type SaveStatus } from '../hooks/useAutosave'
import { importDrawingFile } from '../features/pdf/importDrawing'

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
  const [name, setName] = useState('')
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

  const status = useAutosave(
    name,
    async (value) => {
      if (!projectId || !value.trim()) return
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

  const handleDelete = async () => {
    if (!projectId) return
    if (!confirm(`Ta bort projektet "${project.name}"? Detta går inte att ångra.`)) return
    await db.projects.delete(projectId)
    navigate('/')
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
            value={name}
            onChange={(e) => {
              setNameTouched(true)
              setName(e.target.value)
            }}
          />
        </div>

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
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card" style={{ marginBottom: 12 }}>
          <strong>Rum</strong>
          <p className="field-hint">Rumstaggar tolkas automatiskt ur ritningarna – kommer i nästa fas.</p>
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
