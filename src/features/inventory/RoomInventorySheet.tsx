import { Fragment, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
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
import { RoomPerspectiveNav } from './RoomPerspectiveNav'
import { tagLabel } from '../tags/tagLabel'
import { tagChipStyle } from '../tags/colorForValue'
import { deleteRoomCascade } from '../data/cascadeDelete'
import { blurOnEnterEscape, confirmOnEnterEscape } from '../../utils/keyboardShortcuts'
import { RAIL_TABS, CATEGORY_LABEL, CATEGORY_ICON, isRoomCategory, type RailTab, type RoomTab } from './categories'

type DropIndicator = { category: RoomCategory; index: number }

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
  dagsljus: string
  storlek: string
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
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null)

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
        dagsljus: record.dagsljus,
        storlek: record.storlek,
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
        dagsljus: value.dagsljus,
        storlek: value.storlek,
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

  const insertMaterial = (category: RoomCategory, index: number, tag: MaterialTag) =>
    setCategoryEntry(category, (entry) => {
      const materials = [...entry.materials]
      const clampedIndex = Math.max(0, Math.min(index, materials.length))
      materials.splice(clampedIndex, 0, { id: createId(), tagId: tag.id, note: '' })
      return { ...entry, materials }
    })

  const appendMaterial = (category: RoomCategory, tag: MaterialTag) =>
    insertMaterial(category, loaded?.categories[category].materials.length ?? 0, tag)

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

  // Visar exakt VAR taggen hamnar om man släpper nu (en tunn linje mellan två befintliga
  // material) istället för att bara tona hela listan – annars var det otydligt om släppet skulle
  // lägga till taggen sist, infogas någonstans mitt i, eller inget alls.
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over || active.data.current?.type !== 'tag') {
      setDropIndicator(null)
      return
    }
    const overData = over.data.current as { type?: string; category?: RoomCategory; index?: number } | undefined
    if (overData?.type === 'category' && overData.category) {
      setDropIndicator({ category: overData.category, index: 0 })
      return
    }
    if (overData?.type === 'slot' && overData.category && typeof overData.index === 'number') {
      const draggedRect = active.rect.current.translated
      const overRect = over.rect
      const draggedCenterY = draggedRect ? draggedRect.top + draggedRect.height / 2 : overRect.top + overRect.height / 2
      const overCenterY = overRect.top + overRect.height / 2
      const insertIndex = draggedCenterY < overCenterY ? overData.index : overData.index + 1
      setDropIndicator({ category: overData.category, index: insertIndex })
      return
    }
    setDropIndicator(null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragTag(null)
    const indicator = dropIndicator
    setDropIndicator(null)
    const activeData = event.active.data.current
    if (activeData?.type !== 'tag' || !indicator) return
    insertMaterial(indicator.category, indicator.index, activeData.tag as MaterialTag)
  }

  return (
    <div className="modal-backdrop inventory-sheet-backdrop" onClick={() => void handleClose()}>
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={() => {
              setActiveDragTag(null)
              setDropIndicator(null)
            }}
          >
            <div className="room-workspace">
              <div className="room-nav-row">
                <CategoryRail active={activeTab} onSelect={setActiveTab} />
                <RoomPerspectiveNav active={isRoomCategory(activeTab) ? activeTab : null} onSelect={setActiveTab} />
              </div>

              <div className="room-workspace-body">
                <div className="room-workspace-main">
                  <h2 className="active-category-label">{CATEGORY_LABEL[activeTab]}</h2>
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
                      <div className="field">
                        <label htmlFor="dagsljus">Dagsljus</label>
                        <input
                          id="dagsljus"
                          value={loaded.dagsljus}
                          placeholder="t.ex. Ja, fönster mot gård"
                          enterKeyHint="done"
                          onChange={(e) => setField('dagsljus', () => e.target.value)}
                          onKeyDown={blurOnEnterEscape}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="storlek">Storlek</label>
                        <input
                          id="storlek"
                          value={loaded.storlek}
                          placeholder="t.ex. 24 m²"
                          enterKeyHint="done"
                          onChange={(e) => setField('storlek', () => e.target.value)}
                          onKeyDown={blurOnEnterEscape}
                        />
                      </div>
                    </div>
                  ) : (
                    <CategoryContent
                      key={activeTab}
                      category={activeTab}
                      entry={loaded.categories[activeTab]}
                      projectId={projectId}
                      dropIndicatorIndex={dropIndicator?.category === activeTab ? dropIndicator.index : null}
                      onRemoveMaterial={(ref, tag) => removeMaterial(activeTab, ref, tag)}
                      onNoteChange={(refId, note) => updateMaterialNote(activeTab, refId, note)}
                      onOvrigtChange={(value) => updateOvrigt(activeTab, value)}
                    />
                  )}
                </div>

                {isRoomCategory(activeTab) && (
                  <TagPalette key={activeTab} projectId={projectId} category={activeTab} onPick={(tag) => appendMaterial(activeTab, tag)} />
                )}
              </div>
            </div>

            <DragOverlay>
              {activeDragTag && (
                <div className="palette-tag drag-preview">
                  <span className="tag-chip" style={tagChipStyle(activeDragTag.code)}>
                    {activeDragTag.code}
                  </span>
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

/** Enkel ikonrad för de tre kategorier som inte har en egen yta i perspektivillustrationen
 * (Funktion, Utrustning, Övrigt) – Golv/Vägg/Tak väljs istället direkt i RoomPerspectiveNav. Den
 * aktiva kategorin markeras med en mörk, grafisk yta (grå/svart, inte en färg) istället för t.ex.
 * appens vanliga primärfärg, så den tydligt läses som ett eget litet kontrollsystem. */
function CategoryRail({ active, onSelect }: { active: RoomTab; onSelect: (tab: RailTab) => void }) {
  return (
    <div className="category-rail">
      {RAIL_TABS.map((tab) => {
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

/** En kategoris hela innehåll: en platt lista materialtaggar (var och en med sin egen fritextrad)
 * och ett samlat Övrigt-fält längst ner – inga separata "rader" eller behållare per material. En
 * tunn linje (se dropIndicatorIndex) visar exakt var en dragen tagg hamnar mellan befintliga
 * material. */
function CategoryContent({
  category,
  entry,
  projectId,
  dropIndicatorIndex,
  onRemoveMaterial,
  onNoteChange,
  onOvrigtChange,
}: {
  category: RoomCategory
  entry: CategoryEntry
  projectId: string
  dropIndicatorIndex: number | null
  onRemoveMaterial: (ref: MaterialReference, tag: MaterialTag | undefined) => void
  onNoteChange: (refId: string, note: string) => void
  onOvrigtChange: (value: string) => void
}) {
  const tags = useLiveQuery(
    () => db.materialTags.where('projectId').equals(projectId).filter((t) => t.category === category).toArray(),
    [projectId, category],
  )
  const tagById = new Map((tags ?? []).map((t) => [t.id, t]))
  const { setNodeRef } = useDroppable({ id: `category-${category}`, data: { type: 'category', category } })

  return (
    <div className="category-column">
      <div ref={setNodeRef} className="material-flat-list">
        {entry.materials.length === 0 && (
          <p className="field-hint category-empty">Tryck eller dra en tagg hit från listan till höger.</p>
        )}
        {entry.materials.map((ref, index) => (
          <Fragment key={ref.id}>
            {dropIndicatorIndex === index && <div className="insert-indicator" />}
            <MaterialEntry
              index={index}
              category={category}
              reference={ref}
              tag={tagById.get(ref.tagId)}
              projectId={projectId}
              onRemove={() => onRemoveMaterial(ref, tagById.get(ref.tagId))}
              onNoteChange={(value) => onNoteChange(ref.id, value)}
            />
          </Fragment>
        ))}
        {dropIndicatorIndex === entry.materials.length && entry.materials.length > 0 && <div className="insert-indicator" />}
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

/** Ett enskilt material i listan – också en egen droppzon (se handleDragOver i
 * RoomInventorySheet), så en dragen tagg kan släppas precis före eller efter just den här posten
 * istället för att bara hamna sist i listan. */
function MaterialEntry({
  index,
  category,
  reference,
  tag,
  projectId,
  onRemove,
  onNoteChange,
}: {
  index: number
  category: RoomCategory
  reference: MaterialReference
  tag: MaterialTag | undefined
  projectId: string
  onRemove: () => void
  onNoteChange: (value: string) => void
}) {
  const { setNodeRef } = useDroppable({ id: `slot-${category}-${reference.id}`, data: { type: 'slot', category, index } })
  return (
    <div ref={setNodeRef} className="material-entry">
      <div className="material-entry-head">
        <span className="tag-chip" style={tagChipStyle(tag?.code ?? '')}>
          {tagLabel(tag)}
        </span>
        <button type="button" className="material-entry-remove" onClick={onRemove} aria-label={`Ta bort ${tagLabel(tag)}`}>
          ✕
        </button>
      </div>
      <RowTextInput
        projectId={projectId}
        source="materialNote"
        value={reference.note}
        onChange={onNoteChange}
        placeholder="Anteckning (valfritt), t.ex. upp till 1200mm"
      />
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
      <span className="palette-tag-text">
        <span className="tag-chip" style={tagChipStyle(tag.code)}>
          {tag.code}
        </span>
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
