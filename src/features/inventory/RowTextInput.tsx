import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import { blurOnEnterEscape } from '../../utils/keyboardShortcuts'

const MAX_SUGGESTIONS = 6

type FreeTextField = 'rivning' | 'ovrigt'

/** Räknar fram vilka texter som redan använts i det här fältet i projektet, för att kunna
 * föreslå dem igen (t.ex. samma rivningstext i flera rum). */
function useFieldSuggestions(projectId: string, field: FreeTextField): string[] {
  const suggestions = useLiveQuery(async () => {
    const rooms = await db.rooms.where('projectId').equals(projectId).toArray()
    const records = await db.inventoryRecords.where('roomId').anyOf(rooms.map((r) => r.id)).toArray()
    const counts = new Map<string, number>()
    for (const record of records) {
      for (const item of record.items) {
        const text = item[field].trim()
        if (!text) continue
        counts.set(text, (counts.get(text) ?? 0) + 1)
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([text]) => text)
  }, [projectId, field])
  return suggestions ?? []
}

/**
 * Enkelt textfält med förslag från tidigare ifyllda texter i samma fält (Rivning eller Övrigt)
 * i projektet. Till skillnad från materialfältet (se MaterialReferenceEditor) är det här fri
 * löptext, inte en återanvändbar tagg – därför bara förslag, ingen separat lagring.
 */
export function RowTextInput({
  projectId,
  field,
  value,
  onChange,
  placeholder,
  inputId,
}: {
  projectId: string
  field: FreeTextField
  value: string
  onChange: (value: string) => void
  placeholder?: string
  inputId?: string
}) {
  const suggestions = useFieldSuggestions(projectId, field)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase()
    const list = q ? suggestions.filter((s) => s.toLowerCase().includes(q)) : suggestions
    return list.slice(0, MAX_SUGGESTIONS)
  }, [suggestions, value])

  return (
    <div className="material-autocomplete">
      <div className="material-autocomplete-field">
        <input
          ref={inputRef}
          id={inputId}
          value={value}
          placeholder={placeholder}
          enterKeyHint="done"
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={blurOnEnterEscape}
        />
      </div>
      {open && filtered.length > 0 && (
        <ul className="material-suggestions">
          {filtered.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(s)
                  setOpen(false)
                  inputRef.current?.blur()
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
