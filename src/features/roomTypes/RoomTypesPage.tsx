import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db, createId, type CategoryEntry, type RoomCategory, type RoomType } from '../../db'
import { emptyCategories } from '../inventory/defaultTemplate'
import { InventoryWorkspace } from '../inventory/InventoryWorkspace'
import { deleteRoomTypeCascade, deleteMaterialTagCascade } from '../data/cascadeDelete'
import { confirmDialog } from '../../components/ConfirmDialog'
import { blurOnEnterEscape } from '../../utils/keyboardShortcuts'
import { BackIcon } from '../../components/icons'
import { FullscreenButton } from '../../components/FullscreenButton'

/**
 * Typrum – förinställd rumsinfo som valfritt antal rum kan kopplas till (se RoomInventorySheet)
 * istället för att fylla i samma info på varje likadant rum för hand. Nås från projektets
 * inställningslista, listar befintliga typrum och låter en skapa/redigera dem med samma
 * arbetsyta (InventoryWorkspace) som ett vanligt rumskort använder.
 */
export default function RoomTypesPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [editingType, setEditingType] = useState<RoomType | null>(null)

  const roomTypes = useLiveQuery(
    () => (projectId ? db.roomTypes.where('projectId').equals(projectId).sortBy('name') : Promise.resolve<RoomType[]>([])),
    [projectId],
  )
  const roomCountByType = useLiveQuery(async () => {
    if (!projectId) return new Map<string, number>()
    const rooms = await db.rooms.where('projectId').equals(projectId).toArray()
    const counts = new Map<string, number>()
    for (const room of rooms) {
      if (room.roomTypeId) counts.set(room.roomTypeId, (counts.get(room.roomTypeId) ?? 0) + 1)
    }
    return counts
  }, [projectId])

  if (!projectId) return null

  const handleCreate = async () => {
    const roomType: RoomType = {
      id: createId(),
      projectId,
      name: '',
      categories: emptyCategories(),
      antalPersoner: '',
      funktionsbeskrivning: '',
      dagsljus: '',
      storlek: '',
      updatedAt: Date.now(),
    }
    await db.roomTypes.add(roomType)
    setEditingType(roomType)
  }

  return (
    <div className="tags-overview">
      <header className="app-header">
        <button className="btn-ghost btn tap-target" onClick={() => navigate(`/project/${projectId}`)} aria-label="Tillbaka">
          <BackIcon />
        </button>
        <h1 style={{ fontSize: '1.05rem' }}>Typrum</h1>
        <FullscreenButton className="btn-ghost btn tap-target" />
      </header>
      <main className="app-main">
        {roomTypes === undefined ? null : roomTypes.length === 0 ? (
          <p className="field-hint">Inga typrum skapade ännu.</p>
        ) : (
          <div className="card-list">
            {roomTypes.map((type) => {
              const roomCount = roomCountByType?.get(type.id) ?? 0
              return (
                <button key={type.id} className="card tag-card-open" onClick={() => setEditingType(type)}>
                  <span className="tag-card-text">
                    <strong>{type.name || 'Namnlöst typrum'}</strong>
                  </span>
                  {roomCount > 0 && <span className="tag-card-room-count">{roomCount} rum</span>}
                </button>
              )
            })}
          </div>
        )}
        <button className="btn btn-secondary" style={{ marginTop: 10 }} onClick={() => void handleCreate()}>
          + Nytt typrum
        </button>
      </main>
      {editingType && <RoomTypeEditSheet projectId={projectId} roomType={editingType} onClose={() => setEditingType(null)} />}
    </div>
  )
}

/** Hittar nästa lediga "Namnlöst typrum N" – körs bara när man sparar utan att ha skrivit ett
 * namn, så data aldrig går förlorad bara för att man glömde namnge det. */
async function generateUnnamedTypeName(projectId: string, excludeId: string): Promise<string> {
  const existingNames = new Set(
    (await db.roomTypes.where('projectId').equals(projectId).toArray())
      .filter((t) => t.id !== excludeId)
      .map((t) => t.name),
  )
  let n = 1
  while (existingNames.has(`Namnlöst typrum ${n}`)) n++
  return `Namnlöst typrum ${n}`
}

function RoomTypeEditSheet({
  projectId,
  roomType,
  onClose,
}: {
  projectId: string
  roomType: RoomType
  onClose: () => void
}) {
  const [name, setName] = useState(roomType.name)
  const [categories, setCategories] = useState(roomType.categories)
  const [antalPersoner, setAntalPersoner] = useState(roomType.antalPersoner)
  const [funktionsbeskrivning, setFunktionsbeskrivning] = useState(roomType.funktionsbeskrivning)
  const [dagsljus, setDagsljus] = useState(roomType.dagsljus)
  const [storlek, setStorlek] = useState(roomType.storlek)
  const createdTagIdsRef = useRef<Set<string>>(new Set())

  const linkedRoomCount = useLiveQuery(
    () => db.rooms.where('roomTypeId').equals(roomType.id).count(),
    [roomType.id],
  )

  const setCategoryEntry = (category: RoomCategory, updater: (prev: CategoryEntry) => CategoryEntry) =>
    setCategories((prev) => ({ ...prev, [category]: updater(prev[category]) }))

  const persist = async () => {
    // Ett namnlöst typrum ska ALDRIG tappa sin ifyllda data tyst bara för att man glömt namnet –
    // får istället ett automatiskt namn, precis som namnlösa typrum redan visas i listan.
    const trimmedName = name.trim() || (await generateUnnamedTypeName(projectId, roomType.id))
    await db.roomTypes.update(roomType.id, {
      name: trimmedName,
      categories,
      antalPersoner,
      funktionsbeskrivning,
      dagsljus,
      storlek,
      updatedAt: Date.now(),
    })
  }

  const handleDone = async () => {
    createdTagIdsRef.current.clear()
    await persist()
    onClose()
  }

  const handleCancel = async () => {
    for (const tagId of createdTagIdsRef.current) {
      await deleteMaterialTagCascade(projectId, tagId)
    }
    createdTagIdsRef.current.clear()
    // Ett nyskapat, aldrig namngivet typrum tas bort helt istället för att lämnas kvar namnlöst –
    // samma princip som ett rum utan rumsnummer i det vanliga rumskortet.
    if (!roomType.name.trim() && !name.trim()) {
      await deleteRoomTypeCascade(roomType)
    }
    onClose()
  }

  const handleDelete = async () => {
    const count = linkedRoomCount ?? 0
    const warning =
      count > 0
        ? ` Det används av ${count} rum, som friges och behåller sin nuvarande data.`
        : ''
    const confirmed = await confirmDialog(`Ta bort typrummet "${roomType.name || 'Namnlöst typrum'}"?${warning}`, {
      danger: true,
    })
    if (!confirmed) return
    await deleteRoomTypeCascade(roomType)
    onClose()
  }

  return (
    <div className="modal-backdrop inventory-sheet-backdrop" onClick={() => void handleCancel()}>
      <div className="modal-sheet inventory-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="inventory-sheet-header">
          <div className="inventory-sheet-title">
            <input
              className="inventory-room-number"
              value={name}
              placeholder="Namn på typrum"
              enterKeyHint="done"
              // Bara för ett nyss skapat, ännu onamngivet typrum – inte när man öppnar ett
              // befintligt för att bara granska/lägga till bilder, då ska inte tangentbordet
              // poppa upp i onödan.
              autoFocus={!roomType.name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={blurOnEnterEscape}
              aria-label="Namn på typrum"
            />
          </div>
        </div>

        <div className="inventory-sheet-content">
          <InventoryWorkspace
            projectId={projectId}
            categories={categories}
            setCategoryEntry={setCategoryEntry}
            funktion={{ antalPersoner, funktionsbeskrivning, dagsljus, storlek }}
            setFunktionField={(key, value) => {
              if (key === 'antalPersoner') setAntalPersoner(value)
              else if (key === 'funktionsbeskrivning') setFunktionsbeskrivning(value)
              else if (key === 'dagsljus') setDagsljus(value)
              else setStorlek(value)
            }}
            onTagCreated={(tagId) => createdTagIdsRef.current.add(tagId)}
          />
        </div>

        <div className="modal-actions inventory-sheet-footer">
          <button className="btn" style={{ color: 'var(--color-danger)' }} onClick={() => void handleDelete()}>
            Ta bort typrum
          </button>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button className="btn btn-secondary" onClick={() => void handleCancel()}>
              Avbryt
            </button>
            <button className="btn btn-primary" onClick={() => void handleDone()}>
              Klar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
