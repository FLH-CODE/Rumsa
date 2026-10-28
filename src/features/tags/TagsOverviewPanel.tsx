import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createId, ROOM_CATEGORIES, type MaterialTag, type Room, type RoomCategory } from '../../db'
import { deleteMaterialTagCascade } from '../data/cascadeDelete'
import { tagChipStyle, nextTagColorIndex } from './colorForValue'
import { tagLabel } from './tagLabel'
import { BackIcon } from '../../components/icons'
import { CATEGORY_LABEL } from '../inventory/categories'
import { confirmOnEnterEscape } from '../../utils/keyboardShortcuts'
import { confirmDialog } from '../../components/ConfirmDialog'
import { PhotoGallery } from '../../components/PhotoGallery'

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
}: {
  projectId: string
  onClose: () => void
  /** Finns den, går rum i "Används i"-listan att trycka på för att hoppa direkt till rumskortet
   * istället för att bara visa dem som text. */
  onOpenRoom?: (room: Room) => void
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

  return (
    // stopPropagation: panelen kan renderas inuti ett annat lager med egen onClick-stängning
    // (t.ex. rumskortets modal-backdrop) – utan detta skulle ett klick här av misstag stänga
    // (och i rumskortets fall, potentiellt radera) det underliggande lagret också.
    <div className="tags-overview" onClick={(e) => e.stopPropagation()}>
      <header className="app-header">
        <button className="btn-ghost btn tap-target" onClick={onClose} aria-label="Tillbaka">
          <BackIcon />
        </button>
        <h1 style={{ fontSize: '1.05rem' }}>Taggar</h1>
        <span className="tap-target" aria-hidden="true" />
      </header>
      <main className="app-main">
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
      </main>
      {(editingTag || creatingCategory) && (
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
      )}
    </div>
  )
}

function TagEditSheet({
  projectId,
  category,
  tag,
  onClose,
  onOpenRoom,
}: {
  projectId: string
  category: RoomCategory
  tag: MaterialTag | null
  onClose: () => void
  onOpenRoom?: (room: Room) => void
}) {
  const [code, setCode] = useState(tag?.code ?? '')
  const [description, setDescription] = useState(tag?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Vilka rum som redan refererar den här taggen – så man ser räckvidden innan man t.ex. tar
  // bort den. Bara relevant för en befintlig tagg, inte när man håller på att skapa en ny.
  const roomsUsingTag = useLiveQuery(async () => {
    if (!tag) return []
    const rooms = await db.rooms.where('projectId').equals(projectId).toArray()
    const roomById = new Map(rooms.map((r) => [r.id, r]))
    const records = await db.inventoryRecords.where('roomId').anyOf(rooms.map((r) => r.id)).toArray()
    const matchingRoomIds = new Set(
      records
        .filter((record) => Object.values(record.categories).some((entry) => entry.materials.some((m) => m.tagId === tag.id)))
        .map((record) => record.roomId),
    )
    return [...matchingRoomIds]
      .map((id) => roomById.get(id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, 'sv'))
  }, [projectId, tag?.id])

  const handleSave = async () => {
    const trimmedCode = code.trim()
    if (!trimmedCode || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      // Hela kontrollen + skrivningen i en transaktion så en dubbeltryckning (eller en annan
      // rad/flik som skapar samma tagg samtidigt) inte kan skapa två taggar med samma kod.
      await db.transaction('rw', db.materialTags, async () => {
        const collision = await db.materialTags
          .where('projectId')
          .equals(projectId)
          .filter((t) => t.id !== tag?.id && t.category === category && t.code.toLowerCase() === trimmedCode.toLowerCase())
          .first()
        if (collision) {
          throw new Error(`Taggen "${collision.code}" finns redan.`)
        }
        if (tag) {
          await db.materialTags.update(tag.id, { code: trimmedCode, description: description.trim() })
        } else {
          await db.materialTags.add({
            id: createId(),
            projectId,
            category,
            code: trimmedCode,
            description: description.trim(),
            colorIndex: await nextTagColorIndex(projectId, category),
            createdAt: Date.now(),
          })
        }
      })
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Kunde inte spara taggen.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!tag) return
    const confirmed = await confirmDialog(`Ta bort taggen "${tag.code}"? Den tas bort från alla rum som använder den.`, {
      danger: true,
    })
    if (!confirmed) return
    try {
      await deleteMaterialTagCascade(projectId, tag.id)
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Kunde inte ta bort taggen.')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>{tag ? 'Redigera tagg' : `Ny ${CATEGORY_LABEL[category].toLowerCase()}tagg`}</h2>
        <div className="field">
          <label htmlFor="tag-code">Kod</label>
          <input
            id="tag-code"
            autoFocus
            enterKeyHint="done"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="t.ex. Klinker 1"
            onKeyDown={confirmOnEnterEscape(() => void handleSave(), onClose)}
          />
        </div>
        <div className="field">
          <label htmlFor="tag-description">Beskrivning</label>
          <input
            id="tag-description"
            enterKeyHint="done"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="t.ex. Klinkerplatta 600x600, ljusgrå"
            onKeyDown={confirmOnEnterEscape(() => void handleSave(), onClose)}
          />
        </div>
        {tag && (
          <div className="field">
            <label>Används i</label>
            {roomsUsingTag === undefined ? (
              <span className="field-hint">Laddar…</span>
            ) : roomsUsingTag.length === 0 ? (
              <span className="field-hint">Inget rum ännu.</span>
            ) : (
              <div className="tag-used-in-rooms">
                {roomsUsingTag.map((room) =>
                  onOpenRoom ? (
                    <button
                      key={room.id}
                      type="button"
                      className="tag-used-in-chip tag-used-in-chip-button"
                      onClick={() => onOpenRoom(room)}
                    >
                      {room.roomNumber}
                      {room.roomName && ` – ${room.roomName}`}
                    </button>
                  ) : (
                    <span key={room.id} className="tag-used-in-chip">
                      {room.roomNumber}
                      {room.roomName && ` – ${room.roomName}`}
                    </span>
                  ),
                )}
              </div>
            )}
          </div>
        )}
        {tag && (
          <div className="field">
            <label>Bilder</label>
            <TagPhotoGallery tagId={tag.id} />
          </div>
        )}
        {saveError && (
          <p className="field-hint" style={{ color: 'var(--color-danger)' }}>
            {saveError}
          </p>
        )}
        <div className="modal-actions" style={{ justifyContent: tag ? 'space-between' : 'flex-end' }}>
          {tag && (
            <button className="btn" style={{ color: 'var(--color-danger)' }} onClick={() => void handleDelete()}>
              Ta bort
            </button>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" onClick={onClose}>
              Avbryt
            </button>
            <button className="btn btn-primary" onClick={() => void handleSave()} disabled={!code.trim() || saving}>
              {saving ? 'Sparar…' : 'Spara'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Referensfoton knutna till själva taggen (t.ex. hur "Klinker 2" faktiskt ser ut) – delas av alla
 * rum som använder taggen. Bara tillgängligt för en redan sparad tagg (se TagEditSheet ovan). */
function TagPhotoGallery({ tagId }: { tagId: string }) {
  const photos = useLiveQuery(() => db.tagPhotos.where('tagId').equals(tagId).sortBy('createdAt'), [tagId])
  return (
    <PhotoGallery
      photos={photos}
      onAdd={(files) =>
        db.tagPhotos.bulkAdd(Array.from(files).map((file) => ({ id: createId(), tagId, blob: file, createdAt: Date.now() })))
      }
      onDelete={(photo) => db.tagPhotos.delete(photo.id)}
    />
  )
}
