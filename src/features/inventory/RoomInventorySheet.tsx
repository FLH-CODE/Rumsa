import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  db,
  createId,
  type InventoryRecord,
  type InventoryRow,
  type MaterialTag,
  type Room,
  type RoomCategory,
} from '../../db'
import { useAutosave, type SaveStatus } from '../../hooks/useAutosave'
import { ensureInventoryRecord } from './defaultTemplate'
import { RowTextInput } from './RowTextInput'
import { MaterialReferenceEditor } from '../tags/MaterialReferenceEditor'
import { TagsOverviewPanel } from '../tags/TagsOverviewPanel'
import { colorForValue } from '../tags/colorForValue'
import { deleteRoomCascade } from '../data/cascadeDelete'
import { blurOnEnterEscape, confirmOnEnterEscape } from '../../utils/keyboardShortcuts'
import { ROOM_TABS, CATEGORY_LABEL, CATEGORY_ICON, CATEGORY_HAS_RIVNING, isRoomCategory, type RoomTab } from './categories'

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Sparar…',
  saved: 'Sparat',
  error: 'Kunde inte spara',
}

type Loaded = {
  recordId: string
  items: InventoryRow[]
  antalPersoner: string
  funktionsbeskrivning: string
}

function newEmptyItem(category: RoomCategory): InventoryRow {
  return { id: createId(), category, surface: '', rivning: '', materials: [], ovrigt: '' }
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
  const [activeTab, setActiveTab] = useState<RoomTab>('funktion')
  const [activeDragTag, setActiveDragTag] = useState<MaterialTag | null>(null)

  const [roomNumber, setRoomNumber] = useState(room.roomNumber)
  const [roomName, setRoomName] = useState(room.roomName)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

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

  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (record && record.id !== loaded?.recordId) {
      setLoaded({
        recordId: record.id,
        items: record.items,
        antalPersoner: record.antalPersoner,
        funktionsbeskrivning: record.funktionsbeskrivning,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record])

  const status = useAutosave(
    loaded,
    async (value) => {
      if (!value || !record) return
      const patch: Partial<InventoryRecord> = {
        items: value.items,
        antalPersoner: value.antalPersoner,
        funktionsbeskrivning: value.funktionsbeskrivning,
        updatedAt: Date.now(),
      }
      await db.inventoryRecords.update(record.id, patch)
    },
    500,
  )

  const setField = <K extends keyof Loaded>(key: K, updater: (prev: Loaded[K]) => Loaded[K]) => {
    setLoaded((prev) => (prev ? { ...prev, [key]: updater(prev[key]) } : prev))
  }

  const setItems = (updater: (prev: InventoryRow[]) => InventoryRow[]) => setField('items', updater)

  const updateItem = (itemId: string, patch: Partial<InventoryRow>) =>
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item)))

  const removeItem = (itemId: string) => {
    const current = loaded?.items ?? []
    const item = current.find((i) => i.id === itemId)
    const hasContent = Boolean(item?.rivning.trim() || item?.materials.length || item?.ovrigt.trim())
    if (hasContent && !confirm('Ta bort raden? Ifylld text för raden försvinner.')) return
    setItems((prev) => prev.filter((i) => i.id !== itemId))
  }

  const addItem = (category: RoomCategory) => setItems((prev) => [...prev, newEmptyItem(category)])

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current
    if (data?.type === 'tag') setActiveDragTag(data.tag as MaterialTag)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragTag(null)
    const { active, over } = event
    if (!over) return
    const activeData = active.data.current
    if (activeData?.type !== 'tag') return
    const tag = activeData.tag as MaterialTag
    const overData = over.data.current
    if (overData?.type === 'row') {
      updateItem(overData.rowId as string, {
        materials: [...(loaded?.items.find((i) => i.id === overData.rowId)?.materials ?? []), { id: createId(), tagId: tag.id, note: '' }],
      })
    } else if (overData?.type === 'category') {
      setItems((prev) => [
        ...prev,
        { ...newEmptyItem(overData.category as RoomCategory), materials: [{ id: createId(), tagId: tag.id, note: '' }] },
      ])
    }
  }

  const itemsForActiveCategory = isRoomCategory(activeTab) ? (loaded?.items.filter((i) => i.category === activeTab) ?? []) : []

  return (
    <div className="modal-backdrop" onClick={() => void handleClose()}>
      <div className="modal-sheet inventory-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="inventory-sheet-header">
          <div className="inventory-sheet-title">
            <input
              className="inventory-room-number"
              value={roomNumber}
              placeholder="Rumsnummer"
              enterKeyHint="done"
              onChange={(e) => setRoomNumber(e.target.value)}
              onKeyDown={blurOnEnterEscape}
              aria-label="Rumsnummer"
            />
            <input
              className="inventory-room-name"
              value={roomName}
              placeholder="Rumsnamn"
              enterKeyHint="done"
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
        ) : loaded === null ? (
          <p className="field-hint">Laddar…</p>
        ) : (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveDragTag(null)}>
            <div className="room-workspace">
              <CategoryRail active={activeTab} onSelect={setActiveTab} />

              <div className="room-workspace-main">
                {activeTab === 'funktion' ? (
                  <div className="inventory-rows">
                    <div className="field">
                      <label htmlFor="antal-personer">Antal personer</label>
                      <input
                        id="antal-personer"
                        value={loaded.antalPersoner}
                        placeholder="t.ex. 12"
                        enterKeyHint="done"
                        onChange={(e) => setField('antalPersoner', () => e.target.value)}
                        onKeyDown={blurOnEnterEscape}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="funktionsbeskrivning">Funktionsbeskrivning</label>
                      <input
                        id="funktionsbeskrivning"
                        value={loaded.funktionsbeskrivning}
                        placeholder="t.ex. Kommunikationsyta"
                        enterKeyHint="done"
                        onChange={(e) => setField('funktionsbeskrivning', () => e.target.value)}
                        onKeyDown={blurOnEnterEscape}
                      />
                    </div>
                  </div>
                ) : (
                  <CategoryColumn
                    category={activeTab}
                    items={itemsForActiveCategory}
                    projectId={projectId}
                    onUpdateItem={updateItem}
                    onRemoveItem={removeItem}
                    onAddItem={() => addItem(activeTab)}
                  />
                )}
              </div>

              {isRoomCategory(activeTab) && <TagPalette projectId={projectId} category={activeTab} />}
            </div>

            <DragOverlay>
              {activeDragTag && (
                <div className="palette-tag drag-preview">
                  <span className="material-color-dot" style={{ background: colorForValue(activeDragTag.code) }} />
                  <strong>{activeDragTag.code}</strong>
                </div>
              )}
            </DragOverlay>
          </DndContext>
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

/** Vänsterikonraden som ersätter de gamla flikarna – klick byter "arbetsläge" (vilken kategoris
 * rader och taggpalett som visas). Den aktiva kategorin markeras med en mörk, grafisk yta
 * (grå/svart, inte en färg) istället för t.ex. appens vanliga primärfärg, så den tydligt läses
 * som ett eget litet kontrollsystem snarare än ännu en uppsättning vanliga knappar. */
function CategoryRail({ active, onSelect }: { active: RoomTab; onSelect: (tab: RoomTab) => void }) {
  return (
    <div className="category-rail">
      {ROOM_TABS.map((tab) => {
        const Icon = CATEGORY_ICON[tab]
        return (
          <button
            key={tab}
            type="button"
            className={`category-rail-btn${active === tab ? ' active' : ''}`}
            onClick={() => onSelect(tab)}
            aria-label={CATEGORY_LABEL[tab]}
            title={CATEGORY_LABEL[tab]}
          >
            <Icon width={20} height={20} />
          </button>
        )
      })}
    </div>
  )
}

function CategoryColumn({
  category,
  items,
  projectId,
  onUpdateItem,
  onRemoveItem,
  onAddItem,
}: {
  category: RoomCategory
  items: InventoryRow[]
  projectId: string
  onUpdateItem: (itemId: string, patch: Partial<InventoryRow>) => void
  onRemoveItem: (itemId: string) => void
  onAddItem: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `category-${category}`, data: { type: 'category', category } })
  return (
    <div className="category-column">
      <div ref={setNodeRef} className={`category-items${isOver ? ' drop-target' : ''}`}>
        {items.length === 0 && (
          <p className="field-hint category-empty">Dra en tagg hit, eller tryck på "+ Lägg till rad".</p>
        )}
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            category={category}
            projectId={projectId}
            onUpdate={(patch) => onUpdateItem(item.id, patch)}
            onRemove={() => onRemoveItem(item.id)}
          />
        ))}
      </div>
      <button type="button" className="row-group-add-row" onClick={onAddItem}>
        + Lägg till rad
      </button>
    </div>
  )
}

function ItemRow({
  item,
  category,
  projectId,
  onUpdate,
  onRemove,
}: {
  item: InventoryRow
  category: RoomCategory
  projectId: string
  onUpdate: (patch: Partial<InventoryRow>) => void
  onRemove: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `row-${item.id}`, data: { type: 'row', rowId: item.id } })
  return (
    <div ref={setNodeRef} className={`inventory-row${isOver ? ' drop-target' : ''}`}>
      <div className="inventory-row-header">
        <input
          className="inventory-surface-name"
          value={item.surface}
          placeholder={`Namn (t.ex. ${CATEGORY_LABEL[category]})`}
          aria-label="Namn"
          enterKeyHint="done"
          onChange={(e) => onUpdate({ surface: e.target.value })}
          onKeyDown={blurOnEnterEscape}
        />
        <button className="inventory-remove-row tap-target" onClick={onRemove} aria-label="Ta bort rad">
          ✕
        </button>
      </div>
      {CATEGORY_HAS_RIVNING[category] && (
        <div className="field">
          <label htmlFor={`rivning-${item.id}`}>Rivning</label>
          <RowTextInput
            inputId={`rivning-${item.id}`}
            projectId={projectId}
            field="rivning"
            value={item.rivning}
            onChange={(value) => onUpdate({ rivning: value })}
            placeholder="t.ex. Bef. golv rivs."
          />
        </div>
      )}
      <div className="field">
        <label>Material</label>
        <MaterialReferenceEditor
          projectId={projectId}
          category={category}
          references={item.materials}
          onChange={(materials) => onUpdate({ materials })}
        />
      </div>
      <div className="field">
        <label htmlFor={`ovrigt-${item.id}`}>Övrigt</label>
        <RowTextInput
          inputId={`ovrigt-${item.id}`}
          projectId={projectId}
          field="ovrigt"
          value={item.ovrigt}
          onChange={(value) => onUpdate({ ovrigt: value })}
          placeholder="t.ex. Anmärkning om skicket"
        />
      </div>
    </div>
  )
}

/** Alltid synlig taggpalett för den aktiva kategorin, till höger om rumskortets innehåll – man
 * drar en tagg härifrån och släpper den på en rad för att lägga till den (se handleDragEnd). */
function TagPalette({ projectId, category }: { projectId: string; category: RoomCategory }) {
  const tags = useLiveQuery(
    () => db.materialTags.where('projectId').equals(projectId).filter((t) => t.category === category).sortBy('code'),
    [projectId, category],
  )
  const [creating, setCreating] = useState(false)

  return (
    <div className="tag-palette">
      <div className="tag-palette-list">
        {tags === undefined ? null : tags.length === 0 && !creating ? (
          <p className="field-hint">Inga taggar ännu.</p>
        ) : (
          tags.map((tag) => <PaletteTag key={tag.id} tag={tag} />)
        )}
      </div>
      {creating ? (
        <PaletteTagCreate projectId={projectId} category={category} onDone={() => setCreating(false)} />
      ) : (
        <button type="button" className="material-add-btn" onClick={() => setCreating(true)}>
          + Skapa ny tagg
        </button>
      )}
    </div>
  )
}

function PaletteTag({ tag }: { tag: MaterialTag }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${tag.id}`,
    data: { type: 'tag', tag },
  })
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`palette-tag${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...attributes}
      {...listeners}
    >
      <span className="material-color-dot" style={{ background: colorForValue(tag.code) }} />
      <span className="palette-tag-text">
        <strong>{tag.code}</strong>
        {tag.description && <span className="field-hint">{tag.description}</span>}
      </span>
    </button>
  )
}

function PaletteTagCreate({
  projectId,
  category,
  onDone,
}: {
  projectId: string
  category: RoomCategory
  onDone: () => void
}) {
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    const trimmed = code.trim()
    if (!trimmed || saving) return
    setSaving(true)
    setError(null)
    try {
      await db.transaction('rw', db.materialTags, async () => {
        const collision = await db.materialTags
          .where('projectId')
          .equals(projectId)
          .filter((t) => t.category === category && t.code.toLowerCase() === trimmed.toLowerCase())
          .first()
        if (collision) throw new Error(`Taggen "${collision.code}" finns redan.`)
        await db.materialTags.add({
          id: createId(),
          projectId,
          category,
          code: trimmed,
          description: description.trim(),
          colorIndex: 0,
          createdAt: Date.now(),
        })
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte skapa taggen.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="tag-quick-add">
      <div className="field">
        <input
          autoFocus
          enterKeyHint="done"
          value={code}
          placeholder="Kod, t.ex. Klinker 1"
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={confirmOnEnterEscape(() => void handleSave(), onDone)}
        />
      </div>
      <div className="field">
        <input
          enterKeyHint="done"
          value={description}
          placeholder="Beskrivning (valfritt)"
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={confirmOnEnterEscape(() => void handleSave(), onDone)}
        />
      </div>
      {error && (
        <p className="field-hint" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}
      <div className="tag-quick-add-actions">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Avbryt
        </button>
        <button type="button" className="btn btn-primary" disabled={!code.trim() || saving} onClick={() => void handleSave()}>
          {saving ? 'Sparar…' : 'Skapa'}
        </button>
      </div>
    </div>
  )
}
