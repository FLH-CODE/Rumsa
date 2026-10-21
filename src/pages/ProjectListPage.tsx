import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db, createId, type Project } from '../db'
import { deleteProjectCascade } from '../features/data/cascadeDelete'
import { ROOM_NUMBER_PRESETS } from '../features/project/roomNumberPresets'
import { TrashIcon, ChevronRightIcon } from '../components/icons'

export default function ProjectListPage() {
  const navigate = useNavigate()
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), [])
  const [showCreate, setShowCreate] = useState(false)

  const handleDelete = async (project: Project) => {
    if (
      !confirm(
        `Ta bort projektet "${project.name}"? Ritningar och all inventerad data för projektet tas bort permanent.`,
      )
    ) {
      return
    }
    await deleteProjectCascade(project.id)
  }

  return (
    <>
      <header className="app-header">
        <h1>Rumsa</h1>
      </header>
      <main className="app-main">
        {projects === undefined ? null : projects.length === 0 ? (
          <div className="empty-state">
            <p>Inga projekt ännu.</p>
            <p>Tryck på + för att skapa ditt första inventeringsprojekt.</p>
          </div>
        ) : (
          <div className="card-list">
            {projects.map((project) => (
              <div key={project.id} className="card project-card">
                <button className="card-link-btn" onClick={() => navigate(`/project/${project.id}`)}>
                  <span className="card-link">
                    <strong>{project.name}</strong>
                    <span>Uppdaterad {new Date(project.updatedAt).toLocaleDateString('sv-SE')}</span>
                  </span>
                </button>
                <ChevronRightIcon className="project-card-chevron" />
                <button
                  className="project-delete-btn tap-target"
                  aria-label={`Ta bort ${project.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleDelete(project)
                  }}
                >
                  <TrashIcon width={18} height={18} />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
      <button className="fab tap-target" onClick={() => setShowCreate(true)} aria-label="Nytt projekt">
        +
      </button>
      {showCreate && <CreateProjectSheet onClose={() => setShowCreate(false)} />}
    </>
  )
}

function CreateProjectSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [pattern, setPattern] = useState(ROOM_NUMBER_PRESETS[0].value)

  async function handleCreate() {
    if (!name.trim()) return
    const now = Date.now()
    const project: Project = {
      id: createId(),
      name: name.trim(),
      roomNumberPattern: pattern,
      createdAt: now,
      updatedAt: now,
    }
    await db.projects.add(project)
    onClose()
    navigate(`/project/${project.id}`)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Nytt projekt</h2>
        <div className="field">
          <label htmlFor="project-name">Projektnamn</label>
          <input
            id="project-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="t.ex. NCC Kontor Badhustomten"
          />
        </div>
        <div className="field">
          <label htmlFor="room-pattern">Rumsnummerformat i ritningarna</label>
          <select id="room-pattern" value={pattern} onChange={(e) => setPattern(e.target.value)}>
            {ROOM_NUMBER_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <span className="field-hint">
            Styr hur appen känner igen rumsnummer när ritningar tolkas. Kan ändras senare per projekt.
          </span>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Avbryt
          </button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={!name.trim()}>
            Skapa projekt
          </button>
        </div>
      </div>
    </div>
  )
}
