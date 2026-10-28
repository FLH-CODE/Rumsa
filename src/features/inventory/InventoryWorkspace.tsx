import { Fragment, useState } from 'react'
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
import { db, createId, type CategoryEntry, type MaterialReference, type MaterialTag, type RoomCategory } from '../../db'
import { RowTextInput } from './RowTextInput'
import { RoomPerspectiveNav } from './RoomPerspectiveNav'
import { tagLabel } from '../tags/tagLabel'
import { tagChipStyle, nextTagColorIndex } from '../tags/colorForValue'
import { confirmDialog } from '../../components/ConfirmDialog'
import { confirmOnEnterEscape, blurOnEnterEscape, blurOnEscape } from '../../utils/keyboardShortcuts'
import { NoteIcon, GripIcon } from '../../components/icons'
import { PhotoGallery } from '../../components/PhotoGallery'
import { RAIL_TABS, CATEGORY_LABEL, CATEGORY_ICON, isRoomCategory, type RailTab, type RoomTab } from './categories'

type DropIndicator = { category: RoomCategory; index: number }

export type FunktionFields = {
  antalPersoner: string
  funktionsbeskrivning: string
  dagsljus: string
  storlek: string
}

/**
 * Rumskortets hela arbetsyta: arbetslägesraden (perspektiv + ikonral), det aktiva arbetslägets
 * innehåll och den fristående taggpaletten med dra & släpp. Delad mellan det vanliga rumskortet
 * (RoomInventorySheet) och typrumsredigeraren (RoomTypesPage) så att de alltid beter sig och ser
 * likadana ut – ett typrum är trots allt bara en mall med exakt samma sorts innehåll som ett rum.
 * `readOnly` stänger av redigering helt (använd när rummet är kopplat till ett typrum).
 */
export function InventoryWorkspace({
  projectId,
  roomId,
  categories,
  setCategoryEntry,
  funktion,
  setFunktionField,
  readOnly = false,
  onTagCreated,
}: {
  projectId: string
  /** Rummets id – styr om fliken "Bilder" visas alls. Finns bara för ett riktigt rum (inte när
   * arbetsytan används för att redigera ett typrum, som inte har några egna foton). */
  roomId?: string
  categories: Record<RoomCategory, CategoryEntry>
  setCategoryEntry: (category: RoomCategory, updater: (prev: CategoryEntry) => CategoryEntry) => void
  funktion: FunktionFields
  setFunktionField: <K extends keyof FunktionFields>(key: K, value: FunktionFields[K]) => void
  readOnly?: boolean
  /** Rapporterar id:t för en nyss skapad tagg – låter rumskortet städa bort den igen om man
   * trycker Avbryt istället för Klar. */
  onTagCreated?: (tagId: string) => void
}) {
  const [activeTab, setActiveTab] = useState<RoomTab>('funktion')
  // Bilder är rummets egna (oberoende av ev. typrumskoppling) – men fliken finns bara att välja
  // när arbetsytan faktiskt hör till ett riktigt rum.
  const railTabs = roomId ? RAIL_TABS : RAIL_TABS.filter((tab) => tab !== 'bilder')
  // 'tag' = en ny tagg dras in från paletten (se insertMaterial), 'material' = ett redan applicerat
  // material dras om inom sin egen lista (se moveMaterial). `tag` kan vara undefined för 'material'
  // om taggen det syftar på råkat tas bort (visar då "Okänd tagg", se tagLabel).
  const [activeDrag, setActiveDrag] = useState<{ kind: 'tag' | 'material'; tag: MaterialTag | undefined } | null>(null)
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null)
  // Styrs här (inte lokalt i TagPalette) så att innehållet till vänster om det vertikala
  // strecket kan tonas ner medan man skapar en ny tagg.
  const [creatingTag, setCreatingTag] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // Byte av arbetsläge avbryter alltid en pågående "skapa ny tagg" – annars kunde formuläret
  // (och den expanderade/tonade layouten) hänga kvar för fel kategori.
  const selectTab = (tab: RoomTab) => {
    setCreatingTag(false)
    setActiveTab(tab)
  }

  const insertMaterial = (category: RoomCategory, index: number, tag: MaterialTag) =>
    setCategoryEntry(category, (entry) => {
      const materials = [...entry.materials]
      const clampedIndex = Math.max(0, Math.min(index, materials.length))
      materials.splice(clampedIndex, 0, { id: createId(), tagId: tag.id, note: '' })
      return { ...entry, materials }
    })

  const appendMaterial = (category: RoomCategory, tag: MaterialTag) =>
    insertMaterial(category, categories[category].materials.length, tag)

  const updateMaterialNote = (category: RoomCategory, refId: string, note: string) =>
    setCategoryEntry(category, (entry) => ({
      ...entry,
      materials: entry.materials.map((m) => (m.id === refId ? { ...m, note } : m)),
    }))

  const updateMaterialAntal = (category: RoomCategory, refId: string, antal: number) =>
    setCategoryEntry(category, (entry) => ({
      ...entry,
      materials: entry.materials.map((m) => (m.id === refId ? { ...m, antal: Math.max(1, antal) } : m)),
    }))

  // Flyttar ett REDAN applicerat material till ett nytt index inom samma kategori – skiljs från
  // insertMaterial (som lägger till ett nytt material från paletten) i handleDragEnd via
  // data.type ('material' kontra 'tag').
  const moveMaterial = (category: RoomCategory, fromIndex: number, toIndex: number) =>
    setCategoryEntry(category, (entry) => {
      const materials = [...entry.materials]
      const [moved] = materials.splice(fromIndex, 1)
      // Index:et som indikatorn pekar på räknas i listan FÖRE flytten – har materialet redan
      // plockats bort från en tidigare position krymper allt efter den med ett steg.
      const insertAt = Math.max(0, Math.min(fromIndex < toIndex ? toIndex - 1 : toIndex, materials.length))
      materials.splice(insertAt, 0, moved)
      return { ...entry, materials }
    })

  const removeMaterial = async (category: RoomCategory, ref: MaterialReference, tag: MaterialTag | undefined) => {
    if (!(await confirmDialog(`Ta bort ${tagLabel(tag)}?`, { danger: true }))) return
    setCategoryEntry(category, (entry) => ({ ...entry, materials: entry.materials.filter((m) => m.id !== ref.id) }))
  }

  const updateOvrigt = (category: RoomCategory, value: string) => setCategoryEntry(category, (entry) => ({ ...entry, ovrigt: value }))

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current
    if (data?.type === 'tag') setActiveDrag({ kind: 'tag', tag: data.tag as MaterialTag })
    else if (data?.type === 'material') setActiveDrag({ kind: 'material', tag: data.tag as MaterialTag | undefined })
  }

  // Visar exakt VAR taggen (eller det omflyttade materialet) hamnar om man släpper nu (en tunn
  // linje mellan två befintliga material) istället för att bara tona hela listan – annars var det
  // otydligt om släppet skulle lägga till/flytta taggen sist, in någonstans mitt i, eller inget alls.
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    const activeType = active.data.current?.type
    if (!over || (activeType !== 'tag' && activeType !== 'material')) {
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
    setActiveDrag(null)
    const indicator = dropIndicator
    setDropIndicator(null)
    const activeData = event.active.data.current
    if (!indicator) return
    if (activeData?.type === 'tag') {
      insertMaterial(indicator.category, indicator.index, activeData.tag as MaterialTag)
    } else if (activeData?.type === 'material' && typeof activeData.sourceIndex === 'number' && activeData.category === indicator.category) {
      moveMaterial(indicator.category, activeData.sourceIndex as number, indicator.index)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveDrag(null)
        setDropIndicator(null)
      }}
    >
      <div className="room-workspace">
        <div className="room-nav-row">
          <RoomPerspectiveNav active={isRoomCategory(activeTab) ? activeTab : null} onSelect={selectTab} />
          <CategoryRail tabs={railTabs} active={activeTab} onSelect={selectTab} />
        </div>

        <div className={`room-workspace-body${creatingTag ? ' palette-expanded' : ''}`}>
          <div className="room-workspace-main" inert={creatingTag}>
            <h2 className="active-category-label">{CATEGORY_LABEL[activeTab]}</h2>
            {activeTab === 'funktion' ? (
              readOnly ? (
                <div className="inventory-rows">
                  <FieldValue label="Antal personer" value={funktion.antalPersoner} />
                  <FieldValue label="Funktionsbeskrivning" value={funktion.funktionsbeskrivning} />
                  <FieldValue label="Dagsljus" value={funktion.dagsljus} />
                  <FieldValue label="Storlek" value={funktion.storlek} />
                  {!funktion.antalPersoner.trim() &&
                    !funktion.funktionsbeskrivning.trim() &&
                    !funktion.dagsljus.trim() &&
                    !funktion.storlek.trim() && <p className="field-hint">Inget ifyllt.</p>}
                </div>
              ) : (
                <div className="inventory-rows">
                  <div className="field">
                    <label htmlFor="antal-personer">Antal personer</label>
                    <input
                      id="antal-personer"
                      value={funktion.antalPersoner}
                      placeholder="t.ex. 12"
                      enterKeyHint="done"
                      onChange={(e) => setFunktionField('antalPersoner', e.target.value)}
                      onKeyDown={blurOnEnterEscape}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="funktionsbeskrivning">Funktionsbeskrivning</label>
                    <textarea
                      id="funktionsbeskrivning"
                      rows={2}
                      value={funktion.funktionsbeskrivning}
                      placeholder="t.ex. Kommunikationsyta"
                      onChange={(e) => setFunktionField('funktionsbeskrivning', e.target.value)}
                      onKeyDown={blurOnEscape}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="dagsljus">Dagsljus</label>
                    <input
                      id="dagsljus"
                      value={funktion.dagsljus}
                      placeholder="t.ex. Ja, fönster mot gård"
                      enterKeyHint="done"
                      onChange={(e) => setFunktionField('dagsljus', e.target.value)}
                      onKeyDown={blurOnEnterEscape}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="storlek">Storlek</label>
                    <input
                      id="storlek"
                      value={funktion.storlek}
                      placeholder="t.ex. 24 m²"
                      enterKeyHint="done"
                      onChange={(e) => setFunktionField('storlek', e.target.value)}
                      onKeyDown={blurOnEnterEscape}
                    />
                  </div>
                </div>
              )
            ) : activeTab === 'bilder' ? (
              roomId && <RoomPhotoGallery roomId={roomId} />
            ) : (
              <CategoryContent
                key={activeTab}
                category={activeTab}
                entry={categories[activeTab]}
                projectId={projectId}
                readOnly={readOnly}
                dropIndicatorIndex={dropIndicator?.category === activeTab ? dropIndicator.index : null}
                onRemoveMaterial={(ref, tag) => void removeMaterial(activeTab, ref, tag)}
                onNoteChange={(refId, note) => updateMaterialNote(activeTab, refId, note)}
                onAntalChange={(refId, antal) => updateMaterialAntal(activeTab, refId, antal)}
                onOvrigtChange={(value) => updateOvrigt(activeTab, value)}
              />
            )}
          </div>

          {!readOnly && isRoomCategory(activeTab) && (
            <TagPalette
              key={activeTab}
              projectId={projectId}
              category={activeTab}
              creating={creatingTag}
              onCreatingChange={setCreatingTag}
              onPick={(tag) => appendMaterial(activeTab, tag)}
              onTagCreated={onTagCreated}
            />
          )}
        </div>
      </div>

      <DragOverlay>
        {activeDrag && (
          <span className="tag-chip drag-preview" style={tagChipStyle(activeDrag.tag?.colorIndex)}>
            {tagLabel(activeDrag.tag)}
          </span>
        )}
      </DragOverlay>
    </DndContext>
  )
}

/** Visar ett fälts värde som vanlig text – ingen inputbehållare att redigera i, och syns inte alls
 * om fältet är tomt (en tom "förklarande" inputruta utan redigeringsmöjlighet ger bara intrycket
 * av en trasig/låst kontroll). Används för skrivskyddade (typrums-ärvda) fält. */
function FieldValue({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null
  return (
    <div className="field">
      <label>{label}</label>
      <p className="field-static-value">{value}</p>
    </div>
  )
}

/** Enkel ikonrad, på en rad till höger om perspektivillustrationen, för de tre kategorier som
 * inte har en egen yta där (Funktion, Utrustning, Övrigt) – Golv/Vägg/Tak väljs istället direkt i
 * RoomPerspectiveNav. Samma streck och färg (se index.css) som RoomPerspectiveNav använder för sina
 * ytor, så ikonralen läses som en fortsättning av samma kontrollsystem istället för ett separat. */
function CategoryRail({
  tabs,
  active,
  onSelect,
}: {
  tabs: RailTab[]
  active: RoomTab
  onSelect: (tab: RailTab) => void
}) {
  return (
    <div className="category-rail">
      {tabs.map((tab) => {
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
  readOnly,
  dropIndicatorIndex,
  onRemoveMaterial,
  onNoteChange,
  onAntalChange,
  onOvrigtChange,
}: {
  category: RoomCategory
  entry: CategoryEntry
  projectId: string
  readOnly: boolean
  dropIndicatorIndex: number | null
  onRemoveMaterial: (ref: MaterialReference, tag: MaterialTag | undefined) => void
  onNoteChange: (refId: string, note: string) => void
  onAntalChange: (refId: string, antal: number) => void
  onOvrigtChange: (value: string) => void
}) {
  const tags = useLiveQuery(
    () => db.materialTags.where('projectId').equals(projectId).filter((t) => t.category === category).toArray(),
    [projectId, category],
  )
  const tagById = new Map((tags ?? []).map((t) => [t.id, t]))
  const { setNodeRef } = useDroppable({ id: `category-${category}`, data: { type: 'category', category }, disabled: readOnly })

  return (
    <div className="category-column">
      <div ref={setNodeRef} className="material-flat-list">
        {entry.materials.length === 0 && (
          <p className="field-hint category-empty">
            {readOnly ? 'Inget material angivet.' : 'Tryck eller dra en tagg hit från listan till höger.'}
          </p>
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
              readOnly={readOnly}
              onRemove={() => onRemoveMaterial(ref, tagById.get(ref.tagId))}
              onNoteChange={(value) => onNoteChange(ref.id, value)}
              onAntalChange={(antal) => onAntalChange(ref.id, antal)}
            />
          </Fragment>
        ))}
        {dropIndicatorIndex === entry.materials.length && entry.materials.length > 0 && <div className="insert-indicator" />}
      </div>
      {readOnly ? (
        <FieldValue label="Övrigt" value={entry.ovrigt} />
      ) : (
        <div className="field">
          <label htmlFor={`ovrigt-${category}`}>Övrigt</label>
          <RowTextInput
            inputId={`ovrigt-${category}`}
            projectId={projectId}
            source="ovrigt"
            multiline
            value={entry.ovrigt}
            onChange={onOvrigtChange}
            placeholder="t.ex. Anmärkning om skicket"
          />
        </div>
      )}
    </div>
  )
}

/** Foton knutna till rummet – tagna direkt med kameran (på mobil, via `capture`) eller valda ur
 * galleriet. Oberoende av `readOnly`: ett foto visar det faktiska rummet och ska gå att lägga
 * till/ta bort även när rummet är kopplat till ett typrum (vars data annars är skrivskyddad). */
function RoomPhotoGallery({ roomId }: { roomId: string }) {
  const photos = useLiveQuery(() => db.roomPhotos.where('roomId').equals(roomId).sortBy('createdAt'), [roomId])
  return (
    <PhotoGallery
      photos={photos}
      onAdd={(files) =>
        db.roomPhotos.bulkAdd(Array.from(files).map((file) => ({ id: createId(), roomId, blob: file, createdAt: Date.now() })))
      }
      onDelete={(photo) => db.roomPhotos.delete(photo.id)}
    />
  )
}

/** Ett enskilt material i listan – också en egen droppzon (se handleDragOver ovan), så en dragen
 * tagg kan släppas precis före eller efter just den här posten istället för att bara hamna sist i
 * listan. */
function MaterialEntry({
  index,
  category,
  reference,
  tag,
  projectId,
  readOnly,
  onRemove,
  onNoteChange,
  onAntalChange,
}: {
  index: number
  category: RoomCategory
  reference: MaterialReference
  tag: MaterialTag | undefined
  projectId: string
  readOnly: boolean
  onRemove: () => void
  onNoteChange: (value: string) => void
  onAntalChange: (antal: number) => void
}) {
  const { setNodeRef: setDroppableRef } = useDroppable({
    id: `slot-${category}-${reference.id}`,
    data: { type: 'slot', category, index },
    disabled: readOnly,
  })
  // Draghandtaget (GripIcon) är den enda delen av raden som faktiskt startar en dragning – annars
  // skulle ett tryck på anteckningsikonen eller ✕ råka tolkas som att man börjat dra om materialet.
  const { attributes, listeners, setNodeRef: setDraggableRef, isDragging } = useDraggable({
    id: `entry-${reference.id}`,
    data: { type: 'material', category, sourceIndex: index, tag },
    disabled: readOnly,
  })
  // Anteckningsfältet är dolt (ingen behållare) i normalläget – bara ikonen visar att en
  // anteckning finns/går att lägga till. Tryck på ikonen för att fälla ut redigeringsfältet.
  const [editingNote, setEditingNote] = useState(false)
  const hasNote = reference.note.trim().length > 0
  const antal = reference.antal ?? 1

  return (
    <div
      ref={(node) => {
        setDroppableRef(node)
        setDraggableRef(node)
      }}
      className={`material-entry${isDragging ? ' dragging' : ''}`}
    >
      <div className="material-entry-head">
        {!readOnly && (
          <button type="button" className="material-entry-grip" aria-label="Dra för att ändra ordning" {...attributes} {...listeners}>
            <GripIcon width={16} height={16} />
          </button>
        )}
        <span className="tag-chip" style={tagChipStyle(tag?.colorIndex)}>
          {tagLabel(tag)}
        </span>
        {!readOnly && (
          <>
            <button
              type="button"
              className={`material-entry-note-btn${hasNote ? ' has-note' : ''}`}
              onClick={() => setEditingNote((prev) => !prev)}
              aria-pressed={editingNote}
              aria-label={hasNote ? 'Redigera anteckning' : 'Lägg till anteckning'}
            >
              <NoteIcon width={16} height={16} />
            </button>
            <button type="button" className="material-entry-remove" onClick={onRemove} aria-label={`Ta bort ${tagLabel(tag)}`}>
              ✕
            </button>
          </>
        )}
      </div>
      {category === 'utrustning' &&
        (readOnly ? (
          antal > 1 && <p className="field-static-value material-entry-note">Antal: {antal}</p>
        ) : (
          <div className="material-entry-qty">
            <span className="field-hint">Antal</span>
            <button type="button" className="qty-btn" onClick={() => onAntalChange(antal - 1)} aria-label="Minska antal">
              −
            </button>
            <span className="qty-value">{antal}</span>
            <button type="button" className="qty-btn" onClick={() => onAntalChange(antal + 1)} aria-label="Öka antal">
              +
            </button>
          </div>
        ))}
      {readOnly || !editingNote ? (
        hasNote && <p className="field-static-value material-entry-note">{reference.note}</p>
      ) : (
        <RowTextInput
          projectId={projectId}
          source="materialNote"
          multiline
          autoFocus
          value={reference.note}
          onChange={onNoteChange}
          placeholder="Anteckning (valfritt), t.ex. upp till 1200mm"
        />
      )}
    </div>
  )
}

/** Alltid synlig, fristående taggpalett för den aktiva kategorin (ingen omslutande behållare) –
 * en tagg går både att dra och att trycka direkt på för att lägga till den i kortet. Expanderar
 * (och tonar ner innehållet till vänster om strecket) medan man skapar en ny tagg, så Kod/
 * Beskrivning-fälten får gott om plats istället för att klämmas in i den annars smala paletten. */
function TagPalette({
  projectId,
  category,
  creating,
  onCreatingChange,
  onPick,
  onTagCreated,
}: {
  projectId: string
  category: RoomCategory
  creating: boolean
  onCreatingChange: (creating: boolean) => void
  onPick: (tag: MaterialTag) => void
  onTagCreated?: (tagId: string) => void
}) {
  const tags = useLiveQuery(
    () => db.materialTags.where('projectId').equals(projectId).filter((t) => t.category === category).sortBy('code'),
    [projectId, category],
  )

  return (
    <div className={`tag-palette${creating ? ' expanded' : ''}`}>
      {!creating && (
        <div className="tag-palette-list">
          {tags?.map((tag) => <PaletteTag key={tag.id} tag={tag} onPick={() => onPick(tag)} />)}
        </div>
      )}
      {creating ? (
        <PaletteTagCreate projectId={projectId} category={category} onDone={() => onCreatingChange(false)} onCreated={onTagCreated} />
      ) : (
        <button type="button" className="material-add-btn" onClick={() => onCreatingChange(true)}>
          + Skapa ny tagg
        </button>
      )}
    </div>
  )
}

/** Själva pekytan är den klickbara/dragbara knappen. Ingen egen CSS-transform/translate läggs på
 * originalet under drag – det skulle annars (tillsammans med DragOverlay) visa TVÅ kopior av
 * taggen som rör sig samtidigt, en nedtonad (originalet, flyttat rakt mot pekaren oavsett var i
 * layouten den startade) och en skarp (DragOverlay), vilket såg ut som att taggar krockade med
 * annat innehåll de passerade över. Originalet tonas bara ner i rad (`.dragging`) istället, så det
 * är tydligt att DEN flyttas, medan DragOverlay ensam sköter den rörliga kopian. */
function PaletteTag({ tag, onPick }: { tag: MaterialTag; onPick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${tag.id}`,
    data: { type: 'tag', tag },
  })
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`palette-tag${isDragging ? ' dragging' : ''}`}
      onClick={onPick}
      {...attributes}
      {...listeners}
    >
      <span className="palette-tag-text">
        <span className="tag-chip" style={tagChipStyle(tag.colorIndex)}>
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
  onCreated,
}: {
  projectId: string
  category: RoomCategory
  onDone: () => void
  onCreated?: (tagId: string) => void
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
    const id = createId()
    try {
      await db.transaction('rw', db.materialTags, async () => {
        const collision = await db.materialTags
          .where('projectId')
          .equals(projectId)
          .filter((t) => t.category === category && t.code.toLowerCase() === trimmed.toLowerCase())
          .first()
        if (collision) throw new Error(`Taggen "${collision.code}" finns redan.`)
        await db.materialTags.add({
          id,
          projectId,
          category,
          code: trimmed,
          description: description.trim(),
          colorIndex: await nextTagColorIndex(projectId, category),
          createdAt: Date.now(),
        })
      })
      onCreated?.(id)
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
