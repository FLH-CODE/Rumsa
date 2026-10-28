import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createId, type MaterialTag, type Room, type RoomCategory } from '../../db'
import { deleteMaterialTagCascade } from '../data/cascadeDelete'
import { nextTagColorIndex } from './colorForValue'
import { CATEGORY_LABEL } from '../inventory/categories'
import { confirmOnEnterEscape } from '../../utils/keyboardShortcuts'
import { confirmDialog } from '../../components/ConfirmDialog'
import { PhotoGallery } from '../../components/PhotoGallery'

/**
 * Skapa/redigera-rutan för en materialtagg – kod, beskrivning, bilder och (för en redan sparad
 * tagg) vilka rum som använder den. Delad mellan taggöversikten och rumskortets taggpalett (där
 * man numera klickar en tagg för att REDIGERA den, inte för att lägga till den – det görs bara
 * genom att dra taggen till kortet), så de alltid ser likadana ut oavsett varifrån man öppnar dem.
 */
export function TagEditSheet({
  projectId,
  category,
  tag,
  onClose,
  onCreated,
  onOpenRoom,
}: {
  projectId: string
  category: RoomCategory
  tag: MaterialTag | null
  onClose: () => void
  /** Rapporterar id:t för en nyss skapad tagg (inte vid redigering av en befintlig) – låter
   * rumskortet städa bort den igen om man trycker Avbryt istället för Klar. */
  onCreated?: (tagId: string) => void
  /** Finns den, går rum i "Används i"-listan att trycka på för att hoppa direkt till rumskortet
   * istället för att bara visa dem som text. */
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
    const newId = createId()
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
            id: newId,
            projectId,
            category,
            code: trimmedCode,
            description: description.trim(),
            colorIndex: await nextTagColorIndex(projectId, category),
            createdAt: Date.now(),
          })
        }
      })
      if (!tag) onCreated?.(newId)
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
            // Bara vid skapande – inte när man öppnar en befintlig tagg för att bara granska den
            // (t.ex. kolla bilder/"Används i"), då ska inte tangentbordet poppa upp i onödan.
            autoFocus={!tag}
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
 * rum som använder taggen. Bara tillgängligt för en redan sparad tagg. */
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
