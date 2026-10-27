import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createId, type MaterialReference, type MaterialTag, type RoomCategory } from '../../db'
import { colorForValue } from './colorForValue'
import { tagLabel } from './tagLabel'
import { confirmOnEnterEscape } from '../../utils/keyboardShortcuts'

// Listan är scrollbar (se .material-suggestions), så en hög gräns fungerar fint – man ska kunna
// se hela taggbiblioteket direkt när man öppnar fältet, inte bara ett fåtal träffar.
const MAX_SUGGESTIONS = 50

type FormState = { mode: 'add' } | { mode: 'edit'; ref: MaterialReference }

/**
 * Listar materialreferenser på en rad (t.ex. två olika klinkertyper på samma vägg, var och en
 * med en notering som "upp till 1200mm") och låter en lägga till fler – antingen genom att
 * återanvända en befintlig tagg ur projektets taggbibliotek eller skapa en ny i farten (eller
 * genom att dra en tagg hit från kategorins taggpalett, se RoomCategoryWorkspace). En befintlig
 * referens går att trycka på för att ändra tagg/notering i efterhand, eller ta bort (med
 * kontrollfråga, eftersom det inte går att ångra).
 */
export function MaterialReferenceEditor({
  projectId,
  category,
  references,
  onChange,
  addLabel = '+ Lägg till material',
  searchPlaceholder = 'Sök eller skapa tagg, t.ex. Klinker 1',
  removeLabel = 'Ta bort material',
}: {
  projectId: string
  /** Vilken kategoris taggpool referenserna väljs ur – en tagg hör bara till en kategori, så en
   * golvtagg aldrig kan dyka upp som förslag på en vägg eller tvärtom. */
  category: RoomCategory
  references: MaterialReference[]
  onChange: (refs: MaterialReference[]) => void
  addLabel?: string
  searchPlaceholder?: string
  removeLabel?: string
}) {
  const tags =
    useLiveQuery(
      () => db.materialTags.where('projectId').equals(projectId).filter((t) => t.category === category).toArray(),
      [projectId, category],
    ) ?? []
  const tagById = new Map(tags.map((t) => [t.id, t]))
  const [formState, setFormState] = useState<FormState | null>(null)

  const addReference = (tagId: string, note: string) => {
    onChange([...references, { id: createId(), tagId, note: note.trim() }])
    setFormState(null)
  }

  const updateReference = (refId: string, tagId: string, note: string) => {
    onChange(references.map((r) => (r.id === refId ? { ...r, tagId, note: note.trim() } : r)))
    setFormState(null)
  }

  const removeReference = (refId: string) => {
    const ref = references.find((r) => r.id === refId)
    const label = ref ? tagLabel(tagById.get(ref.tagId)) : 'materialet'
    if (!confirm(`Ta bort ${label} från raden?`)) return
    onChange(references.filter((r) => r.id !== refId))
    setFormState(null)
  }

  return (
    <div className="material-ref-list">
      {references.map((ref) => {
        if (formState?.mode === 'edit' && formState.ref.id === ref.id) {
          return (
            <TagQuickAdd
              key={ref.id}
              projectId={projectId}
              category={category}
              tags={tags}
              searchPlaceholder={searchPlaceholder}
              initial={{ tagId: ref.tagId, note: ref.note }}
              onConfirm={(tagId, note) => updateReference(ref.id, tagId, note)}
              onRemove={() => removeReference(ref.id)}
              onCancel={() => setFormState(null)}
            />
          )
        }
        const tag = tagById.get(ref.tagId)
        return (
          <div key={ref.id} className="material-ref-chip">
            <button
              type="button"
              className="material-ref-chip-main"
              onClick={() => setFormState({ mode: 'edit', ref })}
              aria-label={`Ändra ${tagLabel(tag)}${ref.note ? `, ${ref.note}` : ''}`}
            >
              <span className="material-color-dot" style={{ background: colorForValue(tag?.code ?? '') }} />
              <strong>{tagLabel(tag)}</strong>
              {ref.note && <span className="material-ref-note">{ref.note}</span>}
            </button>
            <button
              type="button"
              className="material-ref-remove"
              onClick={() => removeReference(ref.id)}
              aria-label={removeLabel}
            >
              ✕
            </button>
          </div>
        )
      })}

      {formState?.mode === 'add' ? (
        <TagQuickAdd
          projectId={projectId}
          category={category}
          tags={tags}
          searchPlaceholder={searchPlaceholder}
          onConfirm={addReference}
          onCancel={() => setFormState(null)}
        />
      ) : (
        <button type="button" className="material-add-btn" onClick={() => setFormState({ mode: 'add' })}>
          {addLabel}
        </button>
      )}
    </div>
  )
}

function TagQuickAdd({
  projectId,
  category,
  tags,
  initial,
  searchPlaceholder,
  onConfirm,
  onRemove,
  onCancel,
}: {
  projectId: string
  category: RoomCategory
  tags: MaterialTag[]
  /** Förifyller formuläret med en befintlig referens, för redigering istället för tillägg. */
  initial?: { tagId: string; note: string }
  searchPlaceholder: string
  onConfirm: (tagId: string, note: string) => void
  /** Finns bara i redigeringsläge – tar bort referensen helt istället för att ändra den. */
  onRemove?: () => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const initialTag = initial ? tags.find((t) => t.id === initial.tagId) : undefined
  const [query, setQuery] = useState(initialTag?.code ?? '')
  const [selectedTagId, setSelectedTagId] = useState<string | null>(initial?.tagId ?? null)
  const [note, setNote] = useState(initial?.note ?? '')
  const [open, setOpen] = useState(false)
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
        onConfirm(selectedTag.id, note)
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
          .filter((t) => t.category === category && t.code.toLowerCase() === trimmed.toLowerCase())
          .first()
        if (existing) return existing.id

        const newTag: MaterialTag = {
          id: createId(),
          projectId,
          category,
          code: trimmed,
          description: '',
          colorIndex: 0,
          createdAt: Date.now(),
        }
        await db.materialTags.add(newTag)
        return newTag.id
      })
      onConfirm(tagId, note)
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
            ref={inputRef}
            value={displayValue}
            placeholder={searchPlaceholder}
            autoFocus={!initial}
            enterKeyHint="done"
            onChange={(e) => {
              setSelectedTagId(null)
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={confirmOnEnterEscape(() => void handleConfirm(), onCancel)}
          />
        </div>
        {open && !selectedTag && filtered.length > 0 && (
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
                    // e.preventDefault() ovan håller annars kvar fokus (och mobilens tangentbord
                    // uppe) i fältet trots att man gjort sitt val – stäng ner det explicit.
                    inputRef.current?.blur()
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
        autoFocus={Boolean(initial)}
        enterKeyHint="done"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={confirmOnEnterEscape(() => void handleConfirm(), onCancel)}
      />
      <div className="tag-quick-add-actions">
        {onRemove && (
          <button type="button" className="btn" style={{ color: 'var(--color-danger)', marginRight: 'auto' }} onClick={onRemove}>
            Ta bort
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Avbryt
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={(!query.trim() && !selectedTag) || confirming}
          onClick={() => void handleConfirm()}
        >
          {confirming
            ? 'Sparar…'
            : initial
              ? 'Spara'
              : exactMatch || selectedTag
                ? 'Lägg till'
                : `Skapa "${query.trim()}"`}
        </button>
      </div>
    </div>
  )
}
