import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createId, type InventoryRow, type Room } from '../../db'
import { useAutosave, type SaveStatus } from '../../hooks/useAutosave'
import { ensureInventoryRecord } from './defaultTemplate'
import { MaterialAutocompleteInput } from './MaterialAutocompleteInput'
import { deleteRoomCascade } from '../data/cascadeDelete'

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
}: {
  room: Room
  projectId: string
  onClose: () => void
}) {
  const [loadError, setLoadError] = useState<string | null>(null)

  // Rumsnummer/namn kommer från automatisk textigenkänning och kan bli fel – görs redigerbara
  // här så man kan rätta till det utan att behöva köra om hela detekteringen.
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

  // Ett manuellt tillagt rum som stängs utan att få ett nummer skulle annars bli en övergiven,
  // onamngiven tagg kvar på ritningen för alltid.
  const handleClose = async () => {
    if (!roomNumber.trim()) {
      await deleteRoomCascade(room.id)
    }
    onClose()
  }

  // Skapar inventeringsposten första gången rummet öppnas. Körs i en transaktion (se
  // ensureInventoryRecord) så StrictModes dubbelkörning i dev-läge inte skapar två poster.
  useEffect(() => {
    ensureInventoryRecord(room).catch((err) => {
      setLoadError(err instanceof Error ? err.message : 'Kunde inte öppna rummet.')
    })
  }, [room])

  const record = useLiveQuery(() => db.inventoryRecords.where('roomId').equals(room.id).first(), [room.id])

  // Lokalt redigeringsläge, synkat en gång (taggat med record.id) när posten laddas – därefter
  // är lokalt state facit tills man stänger, så att livequeryns återkoppling från vårt eget
  // sparande inte skriver över det man just skriver.
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

  const addRow = () => {
    setRows((prev) => [...prev, { id: createId(), surface: '', rivning: '', malningSortKulor: '' }])
  }

  const removeRow = (rowId: string) => {
    const row = rows?.find((r) => r.id === rowId)
    const hasContent = Boolean(row?.rivning.trim() || row?.malningSortKulor.trim())
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
              aria-label="Rumsnummer"
            />
            <input
              className="inventory-room-name"
              value={roomName}
              placeholder="Rumsnamn"
              onChange={(e) => setRoomName(e.target.value)}
              aria-label="Rumsnamn"
            />
          </div>
          <span className="field-hint">{STATUS_LABEL[status]}</span>
        </div>

        {loadError ? (
          <p className="field-hint" style={{ color: 'var(--color-danger)' }}>
            {loadError}
          </p>
        ) : rows === null ? (
          <p className="field-hint">Laddar…</p>
        ) : (
          <div className="inventory-rows">
            {rows.map((row) => (
              <div className="inventory-row" key={row.id}>
                <div className="inventory-row-header">
                  <input
                    className="inventory-surface-name"
                    value={row.surface}
                    placeholder="Yta (t.ex. Golv)"
                    aria-label="Yta"
                    onChange={(e) => updateRow(row.id, { surface: e.target.value })}
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
                  <MaterialAutocompleteInput
                    inputId={`rivning-${row.id}`}
                    projectId={projectId}
                    field="rivning"
                    value={row.rivning}
                    onChange={(value) => updateRow(row.id, { rivning: value })}
                    placeholder="t.ex. Bef. golv rivs."
                  />
                </div>
                <div className="field">
                  <label htmlFor={`malning-${row.id}`}>Målning/Sort/Kulör</label>
                  <MaterialAutocompleteInput
                    inputId={`malning-${row.id}`}
                    projectId={projectId}
                    field="malningSortKulor"
                    value={row.malningSortKulor}
                    onChange={(value) => updateRow(row.id, { malningSortKulor: value })}
                    placeholder="t.ex. Klinker 1"
                  />
                </div>
              </div>
            ))}
            <button className="btn btn-secondary" onClick={addRow}>
              + Lägg till rad
            </button>
          </div>
        )}

        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <button className="btn" style={{ color: 'var(--color-danger)' }} onClick={() => void handleDeleteRoom()}>
            Ta bort rum
          </button>
          <button className="btn btn-primary" onClick={() => void handleClose()}>
            Klar
          </button>
        </div>
      </div>
    </div>
  )
}
