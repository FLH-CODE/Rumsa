import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createId, type MaterialTag, type Room } from '../../db'
import { deleteMaterialTagCascade } from '../data/cascadeDelete'
import { colorForValue } from './colorForValue'
import { tagLabel } from './tagLabel'
import { CloseIcon } from '../../components/icons'
import { confirmOnEnterEscape } from '../../utils/keyboardShortcuts'

const SECTION_TITLE: Record<MaterialTag['kind'], string> = {
  material: 'Material (Ytskikt)',
  equipment: 'Utrustning',
}

/**
 * Översikt över projektets tagg-bibliotek – material (Ytskikt) och utrustning (Utrustning) är
 * skilda pooler men visas i samma översikt, så man slipper leta efter rätt ställe att hantera
 * dem på. Renderas som en fristående, fullskärms-overlay (fixed position) istället för en vanlig
 * sida så att den går att nå och stänga igen utan att tappa det man höll på med underliggande –
 * t.ex. zoom/pan-läget i ritningsvisaren eller ett öppet, osparat rumskort.
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
  const [creatingKind, setCreatingKind] = useState<MaterialTag['kind'] | null>(null)

  // Hur många rum som refererar varje tagg – så man ser omfattningen direkt i listan, inte bara
  // efter att ha öppnat en enskild tagg.
  const roomCountByTag = useLiveQuery(async () => {
    const rooms = await db.rooms.where('projectId').equals(projectId).toArray()
    const records = await db.inventoryRecords.where('roomId').anyOf(rooms.map((r) => r.id)).toArray()
    const counts = new Map<string, number>()
    for (const record of records) {
      const tagIds = new Set(
        [...record.rows, ...record.equipmentRows].flatMap((row) => row.materials.map((m) => m.tagId)),
      )
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
        <button className="btn-ghost btn tap-target" onClick={onClose} aria-label="Stäng">
          <CloseIcon />
        </button>
        <h1 style={{ fontSize: '1.05rem' }}>Taggar</h1>
        <span className="tap-target" aria-hidden="true" />
      </header>
      <main className="app-main">
        {(['material', 'equipment'] as const).map((kind) => {
          const kindTags = tags?.filter((t) => t.kind === kind)
          return (
            <section key={kind} className="tag-section">
              <h2 className="section-heading-text">{SECTION_TITLE[kind]}</h2>
              {kindTags === undefined ? null : kindTags.length === 0 ? (
                <p className="field-hint">Inga taggar ännu.</p>
              ) : (
                <div className="card-list">
                  {kindTags.map((tag) => {
                    const roomCount = roomCountByTag?.get(tag.id) ?? 0
                    return (
                      <button key={tag.id} className="card tag-card" onClick={() => setEditingTag(tag)}>
                        <span className="material-color-dot" style={{ background: colorForValue(tag.code) }} />
                        <span className="tag-card-text">
                          <strong>{tagLabel(tag)}</strong>
                          <span className="field-hint">{tag.description || 'Ingen beskrivning än'}</span>
                        </span>
                        {roomCount > 0 && <span className="tag-card-room-count">{roomCount} rum</span>}
                      </button>
                    )
                  })}
                </div>
              )}
              <button className="btn btn-secondary" style={{ marginTop: 10 }} onClick={() => setCreatingKind(kind)}>
                + Lägg till tagg
              </button>
            </section>
          )
        })}
      </main>
      {(editingTag || creatingKind) && (
        <TagEditSheet
          projectId={projectId}
          kind={editingTag?.kind ?? creatingKind!}
          tag={editingTag}
          onClose={() => {
            setEditingTag(null)
            setCreatingKind(null)
          }}
          onOpenRoom={onOpenRoom}
        />
      )}
    </div>
  )
}

function TagEditSheet({
  projectId,
  kind,
  tag,
  onClose,
  onOpenRoom,
}: {
  projectId: string
  kind: MaterialTag['kind']
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
        .filter((record) => [...record.rows, ...record.equipmentRows].some((row) => row.materials.some((m) => m.tagId === tag.id)))
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
          .filter((t) => t.id !== tag?.id && t.kind === kind && t.code.toLowerCase() === trimmedCode.toLowerCase())
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
            kind,
            code: trimmedCode,
            description: description.trim(),
            colorIndex: 0,
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
    if (!confirm(`Ta bort taggen "${tag.code}"? Den tas bort från alla rum som använder den.`)) return
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
        <h2 style={{ margin: 0 }}>
          {tag ? 'Redigera tagg' : kind === 'material' ? 'Ny materialtagg' : 'Ny utrustningstagg'}
        </h2>
        <div className="field">
          <label htmlFor="tag-code">Kod</label>
          <input
            id="tag-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={kind === 'material' ? 't.ex. Klinker 1' : 't.ex. Möblering'}
            onKeyDown={confirmOnEnterEscape(() => void handleSave(), onClose)}
          />
        </div>
        <div className="field">
          <label htmlFor="tag-description">Beskrivning</label>
          <input
            id="tag-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={kind === 'material' ? 't.ex. Klinkerplatta 600x600, ljusgrå' : 't.ex. Löst inredningspaket'}
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
