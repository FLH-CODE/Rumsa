import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createId, type MaterialValue } from '../../db'
import { colorForValue } from './colorForValue'

const MAX_SUGGESTIONS = 6

/**
 * Textfält som föreslår tidigare inskrivna värden inom samma projekt och fält (t.ex. tidigare
 * angivna kulörer), med en färgad prick som visuell genväg för att känna igen samma material
 * igen – motsvarar "syntax highlighting"-känslan från skissen.
 */
export function MaterialAutocompleteInput({
  projectId,
  field,
  value,
  onChange,
  placeholder,
  inputId,
}: {
  projectId: string
  field: MaterialValue['field']
  value: string
  onChange: (value: string) => void
  placeholder?: string
  inputId?: string
}) {
  const [open, setOpen] = useState(false)
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearBlurTimeout = () => {
    if (blurTimeout.current) {
      clearTimeout(blurTimeout.current)
      blurTimeout.current = null
    }
  }

  const materialValues = useLiveQuery(
    () =>
      db.materialValues
        .where('projectId')
        .equals(projectId)
        .filter((m) => m.field === field)
        .toArray(),
    [projectId, field],
  )

  const suggestions = useMemo(() => {
    const query = value.trim().toLowerCase()
    const all = (materialValues ?? []).slice().sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    const filtered = query ? all.filter((m) => m.value.toLowerCase().includes(query)) : all
    return filtered.slice(0, MAX_SUGGESTIONS)
  }, [materialValues, value])

  // Läser och skriver i samma transaktion mot databasen (inte mot livequery-ögonblicksbilden i
  // state) – annars kan snabb fokus/blur-växling eller två fält som committar samtidigt skapa
  // dubbletter av samma material.
  const commitValue = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    await db.transaction('rw', db.materialValues, async () => {
      const existing = await db.materialValues
        .where('projectId')
        .equals(projectId)
        .filter((m) => m.field === field && m.value.toLowerCase() === trimmed.toLowerCase())
        .first()
      if (existing) {
        await db.materialValues.update(existing.id, { lastUsedAt: Date.now() })
      } else {
        await db.materialValues.add({
          id: createId(),
          projectId,
          field,
          value: trimmed,
          colorIndex: 0,
          lastUsedAt: Date.now(),
        })
      }
    })
  }

  return (
    <div className="material-autocomplete">
      <div className="material-autocomplete-field">
        <span className="material-color-dot" style={{ background: colorForValue(value) }} />
        <input
          id={inputId}
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            clearBlurTimeout()
            setOpen(true)
          }}
          onBlur={() => {
            // Litet dröjsmål så en klick-händelse på ett förslag hinner registreras innan listan stängs.
            blurTimeout.current = setTimeout(() => {
              setOpen(false)
              void commitValue(value)
            }, 150)
          }}
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="material-suggestions">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  clearBlurTimeout()
                  onChange(s.value)
                  setOpen(false)
                  void commitValue(s.value)
                }}
              >
                <span className="material-color-dot" style={{ background: colorForValue(s.value) }} />
                {s.value}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
