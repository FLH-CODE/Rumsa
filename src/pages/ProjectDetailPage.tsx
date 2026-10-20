import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../db'
import { useAutosave, type SaveStatus } from '../hooks/useAutosave'

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
          <p className="field-hint">Ladda upp PDF-ritningar och koppla till plan – kommer i nästa fas.</p>
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
