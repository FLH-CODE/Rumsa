import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createId, type MaterialReference, type MaterialTag } from '../../db'
import { colorForValue } from './colorForValue'

const MAX_SUGGESTIONS = 6

/**
 * Listar materialreferenser på en rad (t.ex. två olika klinkertyper på samma vägg, var och en
 * med en notering som "upp till 1200mm") och låter en lägga till fler – antingen genom att
 * återanvända en befintlig tagg ur projektets taggbibliotek eller skapa en ny i farten.
 */
export function MaterialReferenceEditor({
  projectId,
  references,
  onChange,
}: {
  projectId: string
  references: MaterialReference[]
  onChange: (refs: MaterialReference[]) => void
}) {
  const tags = useLiveQuery(() => db.materialTags.where('projectId').equals(projectId).toArray(), [projectId]) ?? []
  const tagById = new Map(tags.map((t) => [t.id, t]))
  const [adding, setAdding] = useState(false)

  const addReference = (tagId: string, note: string) => {
    onChange([...references, { id: createId(), tagId, note: note.trim() }])
    setAdding(false)
  }

  const removeReference = (refId: string) => {
    onChange(references.filter((r) => r.id !== refId))
  }

  return (
    <div className="material-ref-list">
      {references.map((ref) => {
        const tag = tagById.get(ref.tagId)
        return (
          <div key={ref.id} className="material-ref-chip">
            <span className="material-color-dot" style={{ background: colorForValue(tag?.code ?? '') }} />
            <strong>{tag?.code ?? 'Okänd tagg'}</strong>
            {ref.note && <span className="material-ref-note">{ref.note}</span>}
            <button
              type="button"
              className="material-ref-remove"
              onClick={() => removeReference(ref.id)}
              aria-label="Ta bort material"
            >
              ✕
            </button>
          </div>
        )
      })}

      {adding ? (
        <TagQuickAdd
          projectId={projectId}
          tags={tags}
          onAdd={addReference}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="material-add-btn" onClick={() => setAdding(true)}>
          + Lägg till material
        </button>
      )}
    </div>
  )
}

function TagQuickAdd({
  projectId,
  tags,
  onAdd,
  onCancel,
}: {
  projectId: string
  tags: MaterialTag[]
  onAdd: (tagId: string, note: string) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(true)
  const [confirming, setConfirming] = useState(false)

  const filterQuery = query.trim().toLowerCase()
  const filtered = (filterQuery ? tags.filter((t) => t.code.toLowerCase().includes(filterQuery)) : tags).slice(
    0,
    MAX_SUGGESTIONS,
  )

  const exactMatch = tags.find((t) => t.code.toLowerCase() === query.trim().toLowerCase())
  // Taggen kan ha tagits bort (t.ex. från taggöversikten) medan den här rutan var öppen.
  const selectedTag = selectedTagId ? tags.find((t) => t.id === selectedTagId) : undefined
  const displayValue = selectedTag ? selectedTag.code : query

  const handleConfirm = async () => {
    if (confirming) return
    setConfirming(true)
    try {
      if (selectedTag) {
        onAdd(selectedTag.id, note)
        return
      }
      const trimmed = query.trim()
      if (!trimmed) return

      // Kontroll + skapande i samma transaktion så en dubbeltryckning (eller en annan rad/flik
      // som skapar samma tagg samtidigt) inte kan ge två taggar med identisk kod.
      const tagId = await db.transaction('rw', db.materialTags, async () => {
        const existing = await db.materialTags
          .where('projectId')
          .equals(projectId)
          .filter((t) => t.code.toLowerCase() === trimmed.toLowerCase())
          .first()
        if (existing) return existing.id

        const newTag: MaterialTag = {
          id: createId(),
          projectId,
          code: trimmed,
          description: '',
          colorIndex: 0,
          createdAt: Date.now(),
        }
        await db.materialTags.add(newTag)
        return newTag.id
      })
      onAdd(tagId, note)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="tag-quick-add">
      <div className="material-autocomplete">
        <div className="material-autocomplete-field">
          {displayValue && <span className="material-color-dot" style={{ background: colorForValue(displayValue) }} />}
          <input
            value={displayValue}
            placeholder="Sök eller skapa tagg, t.ex. Klinker 1"
            autoFocus
            onChange={(e) => {
              setSelectedTagId(null)
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
          />
        </div>
        {open && !selectedTag && query && filtered.length > 0 && (
          <ul className="material-suggestions">
            {filtered.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    setSelectedTagId(t.id)
                    setQuery(t.code)
                    setOpen(false)
                  }}
                >
                  <span className="material-color-dot" style={{ background: colorForValue(t.code) }} />
                  {t.code}
                  {t.description && <span className="material-suggestion-desc">{t.description}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <input
        className="tag-quick-add-note"
        placeholder="Notering (valfritt), t.ex. upp till 1200mm"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="tag-quick-add-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Avbryt
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={(!query.trim() && !selectedTag) || confirming}
          onClick={() => void handleConfirm()}
        >
          {confirming ? 'Lägger till…' : exactMatch || selectedTag ? 'Lägg till' : `Skapa "${query.trim()}"`}
        </button>
      </div>
    </div>
  )
}
