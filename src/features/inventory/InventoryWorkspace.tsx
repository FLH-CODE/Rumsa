import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
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
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { db, createId, type CategoryEntry, type MaterialReference, type MaterialTag, type RoomCategory } from '../../db'
import { RowTextInput } from './RowTextInput'
import { RoomPerspectiveNav } from './RoomPerspectiveNav'
import { TagEditSheet } from '../tags/TagEditSheet'
import { tagLabel } from '../tags/tagLabel'
import { tagChipStyle } from '../tags/colorForValue'
import { confirmDialog } from '../../components/ConfirmDialog'
import { blurOnEnterEscape, blurOnEscape } from '../../utils/keyboardShortcuts'
import { GripIcon, SummaryIcon } from '../../components/icons'
import { PhotoGallery } from '../../components/PhotoGallery'
import { RAIL_TABS, CATEGORY_LABEL, CATEGORY_ICON, isRoomCategory, type RailTab, type RoomTab } from './categories'
import { getLastActiveTab, setLastActiveTab } from './activeTabStore'

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
  // Bilder är rummets egna (oberoende av ev. typrumskoppling) – men fliken finns bara att välja
  // när arbetsytan faktiskt hör till ett riktigt rum.
  const railTabs = roomId ? RAIL_TABS : RAIL_TABS.filter((tab) => tab !== 'bilder')
  // Börjar på senast valda arbetsläge (oavsett rum) istället för att alltid börja om på Funktion –
  // men bara om den fliken faktiskt finns i den HÄR arbetsytan (t.ex. "Bilder" finns inte när man
  // redigerar ett typrum, som saknar roomId).
  const [activeTab, setActiveTab] = useState<RoomTab>(() => {
    const stored = getLastActiveTab()
    if (stored && (isRoomCategory(stored) || stored === 'funktion' || (railTabs as RoomTab[]).includes(stored))) {
      return stored
    }
    return 'funktion'
  })
  // 'tag' = en ny tagg dras in från paletten (se insertMaterial), 'material' = ett redan applicerat
  // material dras om inom sin egen lista (se moveMaterial). `tag` kan vara undefined för 'material'
  // om taggen det syftar på råkat tas bort (visar då "Okänd tagg", se tagLabel).
  const [activeDrag, setActiveDrag] = useState<{ kind: 'tag' | 'material'; tag: MaterialTag | undefined } | null>(null)
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null)
  // En tagg skapas/redigeras alltid i samma popup (se TagEditSheet) oavsett om den öppnas från
  // taggöversikten eller härifrån – `tag: null` betyder "skapar ny" i den valda kategorin.
  const [editingPaletteTag, setEditingPaletteTag] = useState<{ category: RoomCategory; tag: MaterialTag | null } | null>(null)
  // Visar all ifylld data samtidigt, grupperad per kategori, istället för den vanliga
  // flik-i-taget-vyn – se RoomSummary.
  const [showSummary, setShowSummary] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const selectTab = (tab: RoomTab) => {
    setShowSummary(false)
    setActiveTab(tab)
    setLastActiveTab(tab)
  }

  const insertMaterial = (category: RoomCategory, index: number, tag: MaterialTag) =>
    setCategoryEntry(category, (entry) => {
      const materials = [...entry.materials]
      const clampedIndex = Math.max(0, Math.min(index, materials.length))
      materials.splice(clampedIndex, 0, { id: createId(), tagId: tag.id, note: '' })
      return { ...entry, materials }
    })

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
  // data.type ('material' kontra 'tag'). arrayMove (samma hjälpfunktion som sidlistan i
  // DrawingViewerPage.tsx använder) sköter indexjusteringen – ingen egen off-by-one-räkning behövs.
  const moveMaterial = (category: RoomCategory, fromIndex: number, toIndex: number) =>
    setCategoryEntry(category, (entry) => ({ ...entry, materials: arrayMove(entry.materials, fromIndex, toIndex) }))

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

  // Visar exakt VAR en ny tagg (dragen in från paletten) hamnar om man släpper nu (en tunn linje
  // mellan två befintliga material) istället för att bara tona hela listan – annars var det
  // otydligt om släppet skulle lägga till taggen sist, in någonstans mitt i, eller inget alls. Att
  // flytta ett REDAN applicerat material om sig självt hanteras istället helt av SortableContext/
  // useSortable (se MaterialEntry) – de grannraderna glider undan live under dragningen, vilket är
  // tydligare än en statisk linje och inte kräver någon egen indexräkning här.
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (active.data.current?.type !== 'tag') {
      setDropIndicator(null)
      return
    }
    if (!over) {
      setDropIndicator(null)
      return
    }
    const overData = over.data.current as { type?: string; category?: RoomCategory; index?: number } | undefined
    if (overData?.type === 'category' && overData.category) {
      setDropIndicator({ category: overData.category, index: 0 })
      return
    }
    if (overData?.type === 'material' && overData.category && typeof overData.index === 'number') {
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
    const { active, over } = event
    const activeData = active.data.current
    if (activeData?.type === 'tag') {
      if (indicator) insertMaterial(indicator.category, indicator.index, activeData.tag as MaterialTag)
      return
    }
    if (activeData?.type === 'material' && over && active.id !== over.id) {
      const overData = over.data.current as { type?: string; category?: RoomCategory; index?: number } | undefined
      if (overData && overData.category === activeData.category && typeof overData.index === 'number' && typeof activeData.index === 'number') {
        moveMaterial(activeData.category, activeData.index, overData.index)
      }
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
          <RoomPerspectiveNav active={!showSummary && isRoomCategory(activeTab) ? activeTab : null} onSelect={selectTab} />
          <div className="rail-group">
            <CategoryRail tabs={railTabs} active={showSummary ? null : activeTab} onSelect={selectTab} />
            <button
              type="button"
              className={`category-rail-btn summary-rail-btn${showSummary ? ' active' : ''}`}
              onClick={() => setShowSummary((prev) => !prev)}
              aria-label={showSummary ? 'Dölj sammanfattning' : 'Visa sammanfattning'}
              title={showSummary ? 'Dölj sammanfattning' : 'Visa sammanfattning'}
            >
              <SummaryIcon width={20} height={20} />
            </button>
          </div>
        </div>

        {showSummary ? (
          <RoomSummary projectId={projectId} categories={categories} funktion={funktion} />
        ) : (
        <div className="room-workspace-body">
          <div className="room-workspace-main">
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
              onEditTag={(tag) => setEditingPaletteTag({ category: activeTab, tag })}
            />
          )}
        </div>
        )}
      </div>

      <DragOverlay>
        {activeDrag && (
          <span className="tag-chip drag-preview" style={tagChipStyle(activeDrag.tag?.colorIndex)}>
            {tagLabel(activeDrag.tag)}
          </span>
        )}
      </DragOverlay>

      {editingPaletteTag && (
        <TagEditSheet
          projectId={projectId}
          category={editingPaletteTag.category}
          tag={editingPaletteTag.tag}
          onClose={() => setEditingPaletteTag(null)}
          onCreated={onTagCreated}
        />
      )}
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
  active: RoomTab | null
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
            {readOnly ? (
              'Inget material angivet.'
            ) : (
              <>
                Dra en tagg hit från listan till höger <span className="category-empty-arrow" aria-hidden="true">←</span>
              </>
            )}
          </p>
        )}
        <SortableContext items={entry.materials.map((ref) => `entry-${ref.id}`)} strategy={verticalListSortingStrategy}>
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
        </SortableContext>
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
  // Draghandtaget (GripIcon) är den enda delen av raden som faktiskt startar en dragning – annars
  // skulle ett tryck på anteckningsikonen eller ✕ råka tolkas som att man börjat dra om materialet.
  // useSortable (istället för en egen useDraggable+useDroppable-kombination) ger grannraderna en
  // live glid-animation undan under dragningen – se handleDragOver/handleDragEnd ovan för varför
  // det ersatte den tidigare statiska infogningslinjen för just omflyttning.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `entry-${reference.id}`,
    data: { type: 'material', category, index, tag },
    disabled: readOnly,
  })
  // Anteckningen är alltid synlig som vanlig text – bara ikonen (de tre linjerna) fäller ut
  // redigeringsfältet. Ett klick utanför hela raden stänger redigeringsläget igen (texten som
  // redan skrivits in ligger ändå kvar – den sparas som vanligt när rumskortet stängs med Klar).
  const [editingNote, setEditingNote] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasNote = reference.note.trim().length > 0
  const antal = reference.antal ?? 1

  useEffect(() => {
    if (!editingNote) return
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setEditingNote(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [editingNote])

  return (
    <div
      ref={(node) => {
        setNodeRef(node)
        containerRef.current = node
      }}
      style={{ transform: CSS.Transform.toString(transform), transition }}
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
          <button type="button" className="material-entry-remove" onClick={onRemove} aria-label={`Ta bort ${tagLabel(tag)}`}>
            ✕
          </button>
        )}
      </div>
      {/* Indragen i jämnhöjd med taggchipet ovanför (inte raden som helhet, som annars börjar vid
         draghandtaget längre till vänster). */}
      <div className={`material-entry-detail${readOnly ? '' : ' indented'}`}>
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
        {readOnly ? (
          hasNote && <p className="field-static-value material-entry-note">{reference.note}</p>
        ) : editingNote ? (
          <RowTextInput
            projectId={projectId}
            source="materialNote"
            multiline
            bare
            autoFocus
            value={reference.note}
            onChange={onNoteChange}
            placeholder="Anteckning (valfritt), t.ex. upp till 1200mm"
          />
        ) : (
          <p
            className={`field-static-value material-entry-note editable${hasNote ? '' : ' material-entry-note-empty'}`}
            onClick={() => setEditingNote(true)}
          >
            {hasNote ? reference.note : 'Lägg till anteckning'}
          </p>
        )}
      </div>
    </div>
  )
}

/** Alltid synlig, fristående taggpalett för den aktiva kategorin (ingen omslutande behållare) –
 * en tagg går att DRA in i kortet; ett klick öppnar istället samma redigeringspopup som
 * taggöversikten använder (se TagEditSheet), för både en befintlig tagg och (via "+ Skapa ny
 * tagg") en ny. */
function TagPalette({
  projectId,
  category,
  onEditTag,
}: {
  projectId: string
  category: RoomCategory
  onEditTag: (tag: MaterialTag | null) => void
}) {
  const tags = useLiveQuery(
    () => db.materialTags.where('projectId').equals(projectId).filter((t) => t.category === category).sortBy('code'),
    [projectId, category],
  )

  return (
    <div className="tag-palette">
      <h3 className="active-category-label tag-palette-heading">Taggar</h3>
      <div className="tag-palette-list">
        {tags?.map((tag) => <PaletteTag key={tag.id} tag={tag} onEdit={() => onEditTag(tag)} />)}
      </div>
      <button type="button" className="material-add-btn" onClick={() => onEditTag(null)}>
        + Skapa ny tagg
      </button>
    </div>
  )
}

/** Själva pekytan är den klickbara/dragbara knappen. Ingen egen CSS-transform/translate läggs på
 * originalet under drag – det skulle annars (tillsammans med DragOverlay) visa TVÅ kopior av
 * taggen som rör sig samtidigt, en nedtonad (originalet, flyttat rakt mot pekaren oavsett var i
 * layouten den startade) och en skarp (DragOverlay), vilket såg ut som att taggar krockade med
 * annat innehåll de passerade över. Originalet tonas bara ner i rad (`.dragging`) istället, så det
 * är tydligt att DEN flyttas, medan DragOverlay ensam sköter den rörliga kopian.
 * Ett klick (till skillnad från en dragning) öppnar redigeringspopupen istället för att lägga till
 * taggen i kortet – det görs numera bara genom att dra den dit. */
function PaletteTag({ tag, onEdit }: { tag: MaterialTag; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${tag.id}`,
    data: { type: 'tag', tag },
  })
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`palette-tag${isDragging ? ' dragging' : ''}`}
      onClick={onEdit}
      {...attributes}
      {...listeners}
    >
      <span className="palette-tag-chip" style={tagChipStyle(tag.colorIndex)}>
        <span className="palette-tag-code">{tag.code}</span>
        {tag.description && <span className="palette-tag-desc">{tag.description}</span>}
      </span>
    </button>
  )
}

/** "Visa sammanfattning": all ifylld data i rummet på en gång, grupperad per kategori – istället
 * för att behöva klicka igenom varje flik för sig för att få en överblick. Golv/Tak/Vägg (de tre
 * ytorna i perspektivillustrationen) samlas under en gemensam rubrik ("Ytskikt"), eftersom de
 * hänger ihop visuellt i den vanliga vyn också. */
function RoomSummary({
  projectId,
  categories,
  funktion,
}: {
  projectId: string
  categories: Record<RoomCategory, CategoryEntry>
  funktion: FunktionFields
}) {
  const tags = useLiveQuery(() => db.materialTags.where('projectId').equals(projectId).toArray(), [projectId])
  const tagById = new Map((tags ?? []).map((t) => [t.id, t]))
  const funktionEmpty =
    !funktion.antalPersoner.trim() && !funktion.funktionsbeskrivning.trim() && !funktion.dagsljus.trim() && !funktion.storlek.trim()

  return (
    <div className="room-summary">
      <section className="summary-section">
        <h3 className="section-heading-text">Ytskikt</h3>
        {(['golv', 'tak', 'vagg'] as const).map((category) => (
          <div key={category} className="summary-category">
            <h4 className="summary-subheading">{CATEGORY_LABEL[category]}</h4>
            <SummaryCategoryBody entry={categories[category]} tagById={tagById} />
          </div>
        ))}
      </section>
      <SummarySection heading="Utrustning">
        <SummaryCategoryBody entry={categories.utrustning} tagById={tagById} showAntal />
      </SummarySection>
      <SummarySection heading="Övrigt">
        <SummaryCategoryBody entry={categories.ovrigt} tagById={tagById} />
      </SummarySection>
      <SummarySection heading="Funktion">
        {funktionEmpty ? (
          <p className="field-hint">Inget ifyllt.</p>
        ) : (
          <div className="inventory-rows">
            <FieldValue label="Antal personer" value={funktion.antalPersoner} />
            <FieldValue label="Funktionsbeskrivning" value={funktion.funktionsbeskrivning} />
            <FieldValue label="Dagsljus" value={funktion.dagsljus} />
            <FieldValue label="Storlek" value={funktion.storlek} />
          </div>
        )}
      </SummarySection>
    </div>
  )
}

function SummarySection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="summary-section">
      <h3 className="section-heading-text">{heading}</h3>
      {children}
    </section>
  )
}

function SummaryCategoryBody({
  entry,
  tagById,
  showAntal,
}: {
  entry: CategoryEntry
  tagById: Map<string, MaterialTag>
  showAntal?: boolean
}) {
  const hasOvrigt = entry.ovrigt.trim().length > 0
  if (entry.materials.length === 0 && !hasOvrigt) {
    return <p className="field-hint">Inget ifyllt.</p>
  }
  return (
    <div className="inventory-rows">
      {entry.materials.map((ref) => {
        const tag = tagById.get(ref.tagId)
        return (
          <div key={ref.id} className="summary-material">
            <span className="tag-chip" style={tagChipStyle(tag?.colorIndex)}>
              {tagLabel(tag)}
            </span>
            {showAntal && (ref.antal ?? 1) > 1 && <span className="field-hint">Antal: {ref.antal}</span>}
            {ref.note.trim() && <span className="field-static-value material-entry-note">{ref.note}</span>}
          </div>
        )
      })}
      {hasOvrigt && <p className="field-static-value material-entry-note summary-ovrigt">{entry.ovrigt}</p>}
    </div>
  )
}
