import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createId, type MaterialTag } from '../../db'
import { deleteMaterialTagCascade } from '../data/cascadeDelete'
import { colorForValue } from './colorForValue'
import { CloseIcon } from '../../components/icons'

/**
 * Översikt över projektets materialtaggar – skapa, beskriv och ta bort dem på ett ställe.
 * Renderas som en fristående, fullskärms-overlay (fixed position) istället för en vanlig sida
 * så att den går att nå och stänga igen utan att tappa det man höll på med underliggande –
 * t.ex. zoom/pan-läget i ritningsvisaren eller ett öppet, osparat rumskort.
 */
export function TagsOverviewPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const tags = useLiveQuery(() => db.materialTags.where('projectId').equals(projectId).sortBy('code'), [projectId])
  const [editingTag, setEditingTag] = useState<MaterialTag | null>(null)
  const [creating, setCreating] = useState(false)

  return (
    // stopPropagation: panelen kan renderas inuti ett annat lager med egen onClick-stängning
    // (t.ex. rumskortets modal-backdrop) – utan detta skulle ett klick här av misstag stänga
    // (och i rumskortets fall, potentiellt radera) det underliggande lagret också.
    <div className="tags-overview" onClick={(e) => e.stopPropagation()}>
      <header className="app-header">
        <button className="btn-ghost btn tap-target" onClick={onClose} aria-label="Stäng">
          <CloseIcon />
        </button>
        <h1 style={{ fontSize: '1.05rem' }}>Materialtaggar</h1>
        <button className="btn-ghost btn tap-target" onClick={() => setCreating(true)} aria-label="Ny tagg">
          +
        </button>
      </header>
      <main className="app-main">
        {tags === undefined ? null : tags.length === 0 ? (
          <div className="empty-state">
            <p>Inga taggar ännu.</p>
            <p>
              Taggar skapas automatiskt när du lägger till material i ett rum, eller tryck + för att
              förbereda dem i förväg.
            </p>
          </div>
        ) : (
          <div className="card-list">
            {tags.map((tag) => (
              <button key={tag.id} className="card tag-card" onClick={() => setEditingTag(tag)}>
                <span className="material-color-dot" style={{ background: colorForValue(tag.code) }} />
                <span className="tag-card-text">
                  <strong>{tag.code}</strong>
                  <span className="field-hint">{tag.description || 'Ingen beskrivning än'}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </main>
      {(editingTag || creating) && (
        <TagEditSheet
          projectId={projectId}
          tag={editingTag}
          onClose={() => {
            setEditingTag(null)
            setCreating(false)
          }}
        />
      )}
    </div>
  )
}

function TagEditSheet({
  projectId,
  tag,
  onClose,
}: {
  projectId: string
  tag: MaterialTag | null
  onClose: () => void
}) {
  const [code, setCode] = useState(tag?.code ?? '')
  const [description, setDescription] = useState(tag?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleSave = async () => {
    const trimmedCode = code.trim()
    if (!trimmedCode || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      // Hela kontrollen + skrivningen i en transaktion så två samtidiga sparanden (eller en
      // dubbeltryckning) inte kan skapa två taggar med samma kod.
      await db.transaction('rw', db.materialTags, async () => {
        const collision = await db.materialTags
          .where('projectId')
          .equals(projectId)
          .filter((t) => t.id !== tag?.id && t.code.toLowerCase() === trimmedCode.toLowerCase())
          .first()
        if (collision) {
          throw new Error(`Taggen "${collision.code}" finns redan.`)
        }
        if (tag) {
          await db.materialTags.update(tag.id, { code: trimmedCode, description: description.trim() })
        } else {
          await db.materialTags.add({
            id: createId(),
            projectId,
            code: trimmedCode,
            description: description.trim(),
            colorIndex: 0,
            createdAt: Date.now(),
          })
        }
      })
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Kunde inte spara taggen.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!tag) return
    if (!confirm(`Ta bort taggen "${tag.code}"? Den tas bort från alla rum som använder den.`)) return
    try {
      await deleteMaterialTagCascade(projectId, tag.id)
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Kunde inte ta bort taggen.')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>{tag ? 'Redigera tagg' : 'Ny tagg'}</h2>
        <div className="field">
          <label htmlFor="tag-code">Kod</label>
          <input id="tag-code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="t.ex. Klinker 1" />
        </div>
        <div className="field">
          <label htmlFor="tag-description">Beskrivning</label>
          <input
            id="tag-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="t.ex. Klinkerplatta 600x600, ljusgrå"
          />
        </div>
        {saveError && (
          <p className="field-hint" style={{ color: 'var(--color-danger)' }}>
            {saveError}
          </p>
        )}
        <div className="modal-actions" style={{ justifyContent: tag ? 'space-between' : 'flex-end' }}>
          {tag && (
            <button className="btn" style={{ color: 'var(--color-danger)' }} onClick={() => void handleDelete()}>
              Ta bort
            </button>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" onClick={onClose}>
              Avbryt
            </button>
            <button className="btn btn-primary" onClick={() => void handleSave()} disabled={!code.trim() || saving}>
              {saving ? 'Sparar…' : 'Spara'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
