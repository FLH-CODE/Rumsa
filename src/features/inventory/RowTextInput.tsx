import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import { blurOnEnterEscape } from '../../utils/keyboardShortcuts'

const MAX_SUGGESTIONS = 6

/** 'ovrigt' = kategorins samlade övrigt-fält, 'materialNote' = ett enskilt materials fritextrad
 * (t.ex. "upp till 1200mm") – olika källor i datan, men samma förslagsbeteende. */
type SuggestionSource = 'ovrigt' | 'materialNote'

/** Räknar fram vilka texter som redan använts för den här typen av fält i projektet, för att
 * kunna föreslå dem igen (t.ex. samma övrigt-anteckning i flera rum). */
function useFieldSuggestions(projectId: string, source: SuggestionSource): string[] {
  const suggestions = useLiveQuery(async () => {
    const rooms = await db.rooms.where('projectId').equals(projectId).toArray()
    const records = await db.inventoryRecords.where('roomId').anyOf(rooms.map((r) => r.id)).toArray()
    const counts = new Map<string, number>()
    for (const record of records) {
      for (const entry of Object.values(record.categories)) {
        if (source === 'ovrigt') {
          const text = entry.ovrigt.trim()
          if (text) counts.set(text, (counts.get(text) ?? 0) + 1)
        } else {
          for (const m of entry.materials) {
            const text = m.note.trim()
            if (text) counts.set(text, (counts.get(text) ?? 0) + 1)
          }
        }
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([text]) => text)
  }, [projectId, source])
  return suggestions ?? []
}

/**
 * Enkelt textfält med förslag från tidigare ifyllda texter av samma sort i projektet. Till
 * skillnad från materialtaggarna är det här fri löptext – därför bara förslag, ingen separat
 * lagring.
 */
export function RowTextInput({
  projectId,
  source,
  value,
  onChange,
  placeholder,
  inputId,
}: {
  projectId: string
  source: SuggestionSource
  value: string
  onChange: (value: string) => void
  placeholder?: string
  inputId?: string
}) {
  const suggestions = useFieldSuggestions(projectId, source)
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
