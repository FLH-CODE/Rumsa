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
  type CategoryEntry,
  type InventoryRecord,
  type MaterialReference,
  type MaterialTag,
  type Room,
  type RoomCategory,
} from '../../db'
import { useAutosave, type SaveStatus } from '../../hooks/useAutosave'
import { ensureInventoryRecord } from './defaultTemplate'
import { RowTextInput } from './RowTextInput'
import { CategoryIllustration } from './CategoryIllustration'
import { tagLabel } from '../tags/tagLabel'
import { colorForValue } from '../tags/colorForValue'
import { deleteRoomCascade } from '../data/cascadeDelete'
import { blurOnEnterEscape, confirmOnEnterEscape } from '../../utils/keyboardShortcuts'
import { ROOM_TABS, CATEGORY_LABEL, CATEGORY_ICON, CATEGORY_HAS_ILLUSTRATION, isRoomCategory, type RoomTab } from './categories'

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Sparar…',
  saved: 'Sparat',
  error: 'Kunde inte spara',
}

type Loaded = {
  recordId: string
  categories: InventoryRecord['categories']
  antalPersoner: string
  funktionsbeskrivning: string
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
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void handleClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomNumber])

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
        categories: record.categories,
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
        categories: value.categories,
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

  const setCategoryEntry = (category: RoomCategory, updater: (prev: CategoryEntry) => CategoryEntry) =>
    setField('categories', (categories) => ({ ...categories, [category]: updater(categories[category]) }))

  const addMaterial = (category: RoomCategory, tag: MaterialTag) =>
    setCategoryEntry(category, (entry) => ({
      ...entry,
      materials: [...entry.materials, { id: createId(), tagId: tag.id, note: '' }],
    }))

  const updateMaterialNote = (category: RoomCategory, refId: string, note: string) =>
    setCategoryEntry(category, (entry) => ({
      ...entry,
      materials: entry.materials.map((m) => (m.id === refId ? { ...m, note } : m)),
    }))

  const removeMaterial = (category: RoomCategory, ref: MaterialReference, tag: MaterialTag | undefined) => {
    if (!confirm(`Ta bort ${tagLabel(tag)}?`)) return
    setCategoryEntry(category, (entry) => ({ ...entry, materials: entry.materials.filter((m) => m.id !== ref.id) }))
  }

  const updateOvrigt = (category: RoomCategory, value: string) => setCategoryEntry(category, (entry) => ({ ...entry, ovrigt: value }))

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
    const overData = over.data.current
    if (overData?.type === 'category') {
      addMaterial(overData.category as RoomCategory, activeData.tag as MaterialTag)
    }
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
                  <CategoryContent
                    category={activeTab}
                    entry={loaded.categories[activeTab]}
                    projectId={projectId}
                    onRemoveMaterial={(ref, tag) => removeMaterial(activeTab, ref, tag)}
                    onNoteChange={(refId, note) => updateMaterialNote(activeTab, refId, note)}
                    onOvrigtChange={(value) => updateOvrigt(activeTab, value)}
                  />
                )}
              </div>

              {isRoomCategory(activeTab) && <TagPalette projectId={projectId} category={activeTab} onPick={(tag) => addMaterial(activeTab, tag)} />}
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
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button className="btn btn-secondary" onClick={() => void handleClose()}>
              Avbryt
            </button>
            <button className="btn btn-primary" onClick={() => void handleClose()}>
              Klar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Vänsterikonraden som ersätter de gamla flikarna – klick byter "arbetsläge" (vilken kategoris
 * innehåll och taggpalett som visas). Den aktiva kategorin markeras med en mörk, grafisk yta
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

/** En kategoris hela innehåll: en dekorativ perspektivillustration (bara Golv/Vägg/Tak), en platt
 * lista materialtaggar (var och en med sin egen fritextrad) och ett samlat Övrigt-fält längst ner
 * – inga separata "rader" eller behållare per material. */
function CategoryContent({
  category,
  entry,
  projectId,
  onRemoveMaterial,
  onNoteChange,
  onOvrigtChange,
}: {
  category: RoomCategory
  entry: CategoryEntry
  projectId: string
  onRemoveMaterial: (ref: MaterialReference, tag: MaterialTag | undefined) => void
  onNoteChange: (refId: string, note: string) => void
  onOvrigtChange: (value: string) => void
}) {
  const tags = useLiveQuery(
    () => db.materialTags.where('projectId').equals(projectId).filter((t) => t.category === category).toArray(),
    [projectId, category],
  )
  const tagById = new Map((tags ?? []).map((t) => [t.id, t]))
  const { setNodeRef, isOver } = useDroppable({ id: `category-${category}`, data: { type: 'category', category } })

  return (
    <div className="category-column">
      {CATEGORY_HAS_ILLUSTRATION[category] && <CategoryIllustration category={category} />}
      <div ref={setNodeRef} className={`material-flat-list${isOver ? ' drop-target' : ''}`}>
        {entry.materials.length === 0 && (
          <p className="field-hint category-empty">Tryck eller dra en tagg hit från listan till höger.</p>
        )}
        {entry.materials.map((ref) => (
          <div key={ref.id} className="material-entry">
            <div className="material-entry-head">
              <span className="material-color-dot" style={{ background: colorForValue(tagById.get(ref.tagId)?.code ?? '') }} />
              <strong>{tagLabel(tagById.get(ref.tagId))}</strong>
              <button
                type="button"
                className="material-entry-remove"
                onClick={() => onRemoveMaterial(ref, tagById.get(ref.tagId))}
                aria-label={`Ta bort ${tagLabel(tagById.get(ref.tagId))}`}
              >
                ✕
              </button>
            </div>
            <RowTextInput
              projectId={projectId}
              source="materialNote"
              value={ref.note}
              onChange={(value) => onNoteChange(ref.id, value)}
              placeholder="Anteckning (valfritt), t.ex. upp till 1200mm"
            />
          </div>
        ))}
      </div>
      <div className="field">
        <label htmlFor={`ovrigt-${category}`}>Övrigt</label>
        <RowTextInput
          inputId={`ovrigt-${category}`}
          projectId={projectId}
          source="ovrigt"
          value={entry.ovrigt}
          onChange={onOvrigtChange}
          placeholder="t.ex. Anmärkning om skicket"
        />
      </div>
    </div>
  )
}

/** Alltid synlig, fristående taggpalett för den aktiva kategorin (ingen omslutande behållare) –
 * en tagg går både att dra och att trycka direkt på för att lägga till den i kortet. */
function TagPalette({ projectId, category, onPick }: { projectId: string; category: RoomCategory; onPick: (tag: MaterialTag) => void }) {
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
          tags.map((tag) => <PaletteTag key={tag.id} tag={tag} onPick={() => onPick(tag)} />)
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

function PaletteTag({ tag, onPick }: { tag: MaterialTag; onPick: () => void }) {
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
      onClick={onPick}
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
