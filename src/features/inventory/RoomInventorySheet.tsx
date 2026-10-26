import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createId, type InventoryRow, type MaterialReference, type Room } from '../../db'
import { useAutosave, type SaveStatus } from '../../hooks/useAutosave'
import { ensureInventoryRecord } from './defaultTemplate'
import { RowTextInput } from './RowTextInput'
import { GroupedRows } from './GroupedRows'
import { MaterialReferenceEditor } from '../tags/MaterialReferenceEditor'
import { TagsOverviewPanel } from '../tags/TagsOverviewPanel'
import { deleteRoomCascade } from '../data/cascadeDelete'
import { blurOnEnterEscape } from '../../utils/keyboardShortcuts'

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Sparar…',
  saved: 'Sparat',
  error: 'Kunde inte spara',
}

export function RoomInventorySheet({
  room,
  projectId,
  onClose,
  onOpenRoom,
}: {
  room: Room
  projectId: string
  onClose: () => void
  /** Vidarebefordras till taggöversiktens "Används i"-lista, så man kan hoppa direkt till ett
   * annat rum som använder samma tagg utan att behöva stänga och leta upp det manuellt. */
  onOpenRoom?: (room: Room) => void
}) {
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showTags, setShowTags] = useState(false)

  const [roomNumber, setRoomNumber] = useState(room.roomNumber)
  const [roomName, setRoomName] = useState(room.roomName)

  useAutosave(
    { roomNumber, roomName },
    async (value) => {
      const patch: Partial<Room> = {}
      if (value.roomNumber.trim()) patch.roomNumber = value.roomNumber.trim()
      if (value.roomName.trim()) patch.roomName = value.roomName.trim()
      if (Object.keys(patch).length === 0) return
      await db.rooms.update(room.id, patch)
    },
    600,
  )

  const handleDeleteRoom = async () => {
    if (!confirm(`Ta bort rum ${roomNumber || room.roomNumber}? Rumstaggen och dess inventering tas bort permanent.`)) {
      return
    }
    await deleteRoomCascade(room.id)
    onClose()
  }

  const handleClose = async () => {
    if (!roomNumber.trim()) {
      await deleteRoomCascade(room.id)
    }
    onClose()
  }

  // Escape ska gå att trycka för att komma ut ur rumskortet, inte bara ur ett enskilt fält –
  // annars var det enda sättet att stänga att träffa bakgrunden exakt eller trycka "Klar".
  // Om taggöversikten är öppen ovanpå stängs den först, som i vilken annan modal-stapling som helst.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showTags) {
        setShowTags(false)
      } else {
        void handleClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTags, roomNumber])

  useEffect(() => {
    ensureInventoryRecord(room).catch((err) => {
      setLoadError(err instanceof Error ? err.message : 'Kunde inte öppna rummet.')
    })
  }, [room])

  const record = useLiveQuery(() => db.inventoryRecords.where('roomId').equals(room.id).first(), [room.id])

  const [loaded, setLoaded] = useState<{ recordId: string; rows: InventoryRow[] } | null>(null)

  useEffect(() => {
    if (record && record.id !== loaded?.recordId) {
      setLoaded({ recordId: record.id, rows: record.rows })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record])

  const rows = loaded?.rows ?? null

  const status = useAutosave(
    rows,
    async (value) => {
      if (!value || !record) return
      await db.inventoryRecords.update(record.id, { rows: value, updatedAt: Date.now() })
    },
    500,
  )

  const setRows = (updater: (prev: InventoryRow[]) => InventoryRow[]) => {
    setLoaded((prev) => (prev ? { ...prev, rows: updater(prev.rows) } : prev))
  }

  const updateRow = (rowId: string, patch: Partial<InventoryRow>) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)))
  }

  const setRowMaterials = (rowId: string, materials: MaterialReference[]) => {
    updateRow(rowId, { materials })
  }

  const addRow = () => {
    setRows((prev) => [...prev, { id: createId(), surface: '', rivning: '', materials: [], ovrigt: '', groupId: null }])
  }

  const removeRow = (rowId: string) => {
    const row = rows?.find((r) => r.id === rowId)
    const hasContent = Boolean(row?.rivning.trim() || row?.materials.length || row?.ovrigt.trim())
    if (hasContent && !confirm('Ta bort raden? Ifylld text för raden försvinner.')) return
    setRows((prev) => prev.filter((r) => r.id !== rowId))
  }

  return (
    <div className="modal-backdrop" onClick={() => void handleClose()}>
      <div className="modal-sheet inventory-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="inventory-sheet-header">
          <div className="inventory-sheet-title">
            <input
              className="inventory-room-number"
              value={roomNumber}
              placeholder="Rumsnummer"
              onChange={(e) => setRoomNumber(e.target.value)}
              onKeyDown={blurOnEnterEscape}
              aria-label="Rumsnummer"
            />
            <input
              className="inventory-room-name"
              value={roomName}
              placeholder="Rumsnamn"
              onChange={(e) => setRoomName(e.target.value)}
              onKeyDown={blurOnEnterEscape}
              aria-label="Rumsnamn"
            />
          </div>
          <span className="field-hint save-status" data-status={status}>
            {STATUS_LABEL[status]}
          </span>
        </div>

        {loadError ? (
          <p className="field-hint" style={{ color: 'var(--color-danger)' }}>
            {loadError}
          </p>
        ) : rows === null ? (
          <p className="field-hint">Laddar…</p>
        ) : (
          <div className="inventory-rows">
            <GroupedRows
              projectId={projectId}
              rows={rows}
              onRowsChange={(next) => setRows(() => next)}
              renderRow={(row) => (
                <>
                  <div className="inventory-row-header">
                    <input
                      className="inventory-surface-name"
                      value={row.surface}
                      placeholder="Yta (t.ex. Golv)"
                      aria-label="Yta"
                      onChange={(e) => updateRow(row.id, { surface: e.target.value })}
                      onKeyDown={blurOnEnterEscape}
                    />
                    <button
                      className="inventory-remove-row tap-target"
                      onClick={() => removeRow(row.id)}
                      aria-label="Ta bort rad"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="field">
                    <label htmlFor={`rivning-${row.id}`}>Rivning</label>
                    <RowTextInput
                      inputId={`rivning-${row.id}`}
                      projectId={projectId}
                      field="rivning"
                      value={row.rivning}
                      onChange={(value) => updateRow(row.id, { rivning: value })}
                      placeholder="t.ex. Bef. golv rivs."
                    />
                  </div>
                  <div className="field">
                    <label>Material</label>
                    <MaterialReferenceEditor
                      projectId={projectId}
                      references={row.materials}
                      onChange={(materials) => setRowMaterials(row.id, materials)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`ovrigt-${row.id}`}>Övrigt</label>
                    <RowTextInput
                      inputId={`ovrigt-${row.id}`}
                      projectId={projectId}
                      field="ovrigt"
                      value={row.ovrigt}
                      onChange={(value) => updateRow(row.id, { ovrigt: value })}
                      placeholder="t.ex. Fuktskada i hörnet"
                    />
                  </div>
                </>
              )}
            />
            <button className="btn btn-secondary" onClick={addRow}>
              + Lägg till rad
            </button>
          </div>
        )}

        <div className="modal-actions inventory-sheet-footer">
          <button className="btn" style={{ color: 'var(--color-danger)' }} onClick={() => void handleDeleteRoom()}>
            Ta bort rum
          </button>
          <button className="btn btn-ghost-light" onClick={() => setShowTags(true)}>
            Taggar
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => void handleClose()}>
              Avbryt
            </button>
            <button className="btn btn-primary" onClick={() => void handleClose()}>
              Klar
            </button>
          </div>
        </div>
      </div>
      {showTags && (
        <TagsOverviewPanel projectId={projectId} onClose={() => setShowTags(false)} onOpenRoom={onOpenRoom} />
      )}
    </div>
  )
}
