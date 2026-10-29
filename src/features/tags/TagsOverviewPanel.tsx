import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, ROOM_CATEGORIES, type MaterialTag, type Room, type RoomCategory } from '../../db'
import { deleteMaterialTagCascade } from '../data/cascadeDelete'
import { tagChipStyle } from './colorForValue'
import { tagLabel } from './tagLabel'
import { BackIcon, CloseIcon } from '../../components/icons'
import { CATEGORY_LABEL } from '../inventory/categories'
import { confirmDialog } from '../../components/ConfirmDialog'
import { FullscreenButton } from '../../components/FullscreenButton'
import { TagEditSheet } from './TagEditSheet'

/**
 * Översikt över projektets tagg-bibliotek – en sektion per fast kategori (Golv, Vägg, Tak,
 * Övrigt, Utrustning), eftersom en tagg bara går att använda inom sin egen kategori. Renderas som
 * en fristående, fullskärms-overlay (fixed position) istället för en vanlig sida så att den går
 * att nå och stänga igen utan att tappa det man höll på med underliggande – t.ex. zoom/pan-läget
 * i ritningsvisaren eller ett öppet, osparat rumskort.
 */
export function TagsOverviewPanel({
  projectId,
  onClose,
  onOpenRoom,
  variant = 'page',
}: {
  projectId: string
  onClose: () => void
  /** Finns den, går rum i "Används i"-listan att trycka på för att hoppa direkt till rumskortet
   * istället för att bara visa dem som text. */
  onOpenRoom?: (room: Room) => void
  /** 'page' (standard): fristående fullskärms-overlay, som när panelen nås som egen rutt eller
   * öppnas från rumskortet. 'sheet': en mindre, centrerad popup (samma mönster som
   * TagColorFilterSheet) – används när den öppnas direkt ovanpå ritningsvisaren, där en
   * fullskärmstagning annars kändes som att man navigerat bort från ritningen istället för att
   * bara öppnat en liten lista. */
  variant?: 'page' | 'sheet'
}) {
  const tags = useLiveQuery(() => db.materialTags.where('projectId').equals(projectId).sortBy('code'), [projectId])
  const [editingTag, setEditingTag] = useState<MaterialTag | null>(null)
  const [creatingCategory, setCreatingCategory] = useState<RoomCategory | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleQuickDelete = async (tag: MaterialTag) => {
    const confirmed = await confirmDialog(`Ta bort taggen "${tag.code}"? Den tas bort från alla rum som använder den.`, {
      danger: true,
    })
    if (!confirmed) return
    try {
      await deleteMaterialTagCascade(projectId, tag.id)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Kunde inte ta bort taggen.')
    }
  }

  // Hur många rum som refererar varje tagg – så man ser omfattningen direkt i listan, inte bara
  // efter att ha öppnat en enskild tagg.
  const roomCountByTag = useLiveQuery(async () => {
    const rooms = await db.rooms.where('projectId').equals(projectId).toArray()
    const records = await db.inventoryRecords.where('roomId').anyOf(rooms.map((r) => r.id)).toArray()
    const counts = new Map<string, number>()
    for (const record of records) {
      const tagIds = new Set(Object.values(record.categories).flatMap((entry) => entry.materials.map((m) => m.tagId)))
      for (const tagId of tagIds) counts.set(tagId, (counts.get(tagId) ?? 0) + 1)
    }
    return counts
  }, [projectId])

  const categorySections = (
    <>
      {ROOM_CATEGORIES.map((category) => {
        const categoryTags = tags?.filter((t) => t.category === category)
        return (
          <section key={category} className="tag-section">
            <h2 className="section-heading-text">{CATEGORY_LABEL[category]}</h2>
            {categoryTags === undefined ? null : categoryTags.length === 0 ? (
              <p className="field-hint">Inga taggar ännu.</p>
            ) : (
              <div className="card-list">
                {categoryTags.map((tag) => {
                  const roomCount = roomCountByTag?.get(tag.id) ?? 0
                  return (
                    <div key={tag.id} className="card tag-card">
                      <button type="button" className="tag-card-open" onClick={() => setEditingTag(tag)}>
                        <span className="tag-card-text">
                          <span className="tag-chip" style={tagChipStyle(tag.colorIndex)}>
                            {tagLabel(tag)}
                          </span>
                          <span className="field-hint">{tag.description || 'Ingen beskrivning än'}</span>
                        </span>
                        {roomCount > 0 && <span className="tag-card-room-count">{roomCount} rum</span>}
                      </button>
                      <button
                        type="button"
                        className="material-entry-remove tag-card-remove"
                        onClick={() => void handleQuickDelete(tag)}
                        aria-label={`Ta bort ${tag.code}`}
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <button className="btn btn-secondary" style={{ marginTop: 10 }} onClick={() => setCreatingCategory(category)}>
              + Lägg till tagg
            </button>
          </section>
        )
      })}
      {deleteError && (
        <p className="field-hint" style={{ color: 'var(--color-danger)' }}>
          {deleteError}
        </p>
      )}
    </>
  )

  const tagEditSheet = (editingTag || creatingCategory) && (
    <TagEditSheet
      projectId={projectId}
      category={editingTag?.category ?? creatingCategory!}
      tag={editingTag}
      onClose={() => {
        setEditingTag(null)
        setCreatingCategory(null)
      }}
      onOpenRoom={onOpenRoom}
    />
  )

  if (variant === 'sheet') {
    return (
      <div className="modal-backdrop tags-overview-backdrop" onClick={onClose}>
        <div className="modal-sheet tags-overview-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="tags-overview-sheet-header">
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Material och inventarier</h2>
            <button className="btn-ghost btn tap-target" onClick={onClose} aria-label="Stäng">
              <CloseIcon width={18} height={18} />
            </button>
          </div>
          {categorySections}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={onClose}>
              Stäng
            </button>
          </div>
        </div>
        {tagEditSheet}
      </div>
    )
  }

  return (
    // stopPropagation: panelen kan renderas inuti ett annat lager med egen onClick-stängning
    // (t.ex. rumskortets modal-backdrop) – utan detta skulle ett klick här av misstag stänga
    // (och i rumskortets fall, potentiellt radera) det underliggande lagret också.
    <div className="tags-overview" onClick={(e) => e.stopPropagation()}>
      <header className="app-header">
        <button className="btn-ghost btn tap-target" onClick={onClose} aria-label="Tillbaka">
          <BackIcon />
        </button>
        <h1 style={{ fontSize: '1.05rem' }}>Material och inventarier</h1>
        <FullscreenButton className="btn-ghost btn tap-target" />
      </header>
      <main className="app-main">{categorySections}</main>
      {tagEditSheet}
    </div>
  )
}

