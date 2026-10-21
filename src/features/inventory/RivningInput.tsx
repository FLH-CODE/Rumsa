import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'

const MAX_SUGGESTIONS = 6

/** Räknar fram vilka rivningstexter som redan använts i projektet, för att kunna föreslå dem igen. */
function useRivningSuggestions(projectId: string): string[] {
  const suggestions = useLiveQuery(async () => {
    const rooms = await db.rooms.where('projectId').equals(projectId).toArray()
    const records = await db.inventoryRecords.where('roomId').anyOf(rooms.map((r) => r.id)).toArray()
    const counts = new Map<string, number>()
    for (const record of records) {
      for (const row of record.rows) {
        const text = row.rivning.trim()
        if (!text) continue
        counts.set(text, (counts.get(text) ?? 0) + 1)
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([text]) => text)
  }, [projectId])
  return suggestions ?? []
}

/**
 * Enkelt textfält med förslag från tidigare ifyllda rivningstexter i projektet. Till skillnad
 * från materialfältet (se MaterialReferenceEditor) är rivningstext fri löptext, inte en
 * återanvändbar tagg – därför bara förslag, ingen separat lagring.
 */
export function RivningInput({
  projectId,
  value,
  onChange,
  placeholder,
  inputId,
}: {
  projectId: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  inputId?: string
}) {
  const suggestions = useRivningSuggestions(projectId)
  const [open, setOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase()
    const list = q ? suggestions.filter((s) => s.toLowerCase().includes(q)) : suggestions
    return list.slice(0, MAX_SUGGESTIONS)
  }, [suggestions, value])

  return (
    <div className="material-autocomplete">
      <div className="material-autocomplete-field">
        <input
          id={inputId}
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
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
