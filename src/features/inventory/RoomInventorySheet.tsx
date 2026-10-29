import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type CategoryEntry, type InventoryRecord, type Room, type RoomCategory, type RoomType } from '../../db'
import { useAutosave, type SaveStatus } from '../../hooks/useAutosave'
import { ensureInventoryRecord, emptyCategories } from './defaultTemplate'
import { InventoryWorkspace } from './InventoryWorkspace'
import { deleteRoomCascade, deleteMaterialTagCascade } from '../data/cascadeDelete'
import { linkRoomToType, unlinkRoomFromType, applyRoomTypeDataOnce, createRoomTypeFromRoom } from './roomTypeLink'
import { confirmDialog } from '../../components/ConfirmDialog'
import { blurOnEnterEscape } from '../../utils/keyboardShortcuts'
import { LinkIcon, LinkOffIcon, EraserIcon } from '../../components/icons'

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
  const [roomNumber, setRoomNumber] = useState(room.roomNumber)
  const [roomName, setRoomName] = useState(room.roomName)
  const [showTypeMenu, setShowTypeMenu] = useState(false)
  // Visas kort i typrumsmenyn efter "Skapa typrum härifrån" – den nya posten dyker annars inte
  // upp där förrän man råkar öppna menyn på nytt, vilket gjorde det otydligt att något hänt alls.
  const [typeMenuMessage, setTypeMenuMessage] = useState<string | null>(null)

  // Taggar som skapats i den här sessionen (i rumskortets egen taggpalett) – städas bort igen om
  // man trycker Avbryt istället för Klar, så ett avbrutet rumskort inte ändå lämnar kvar nya
  // poster i projektets taggbibliotek.
  const createdTagIdsRef = useRef<Set<string>>(new Set())

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

  const closeSheet = async () => {
    if (!roomNumber.trim()) {
      await deleteRoomCascade(room.id)
    }
    onClose()
  }

  const handleDeleteRoom = async () => {
    const confirmed = await confirmDialog(
      `Ta bort rum ${roomNumber || room.roomNumber}? Rumstaggen och dess inventering tas bort permanent.`,
      { danger: true },
    )
    if (!confirmed) return
    await deleteRoomCascade(room.id)
    onClose()
  }

  const handleCancel = async () => {
    for (const tagId of createdTagIdsRef.current) {
      await deleteMaterialTagCascade(projectId, tagId)
    }
    createdTagIdsRef.current.clear()
    await closeSheet()
  }

  const handleDone = async () => {
    createdTagIdsRef.current.clear()
    await closeSheet()
  }

  // Escape ska gå att trycka för att komma ut ur rumskortet, inte bara ur ett enskilt fält –
  // annars var det enda sättet att stänga att träffa bakgrunden exakt eller trycka "Klar". Beter
  // sig som Avbryt (städar bort ev. nyss skapade taggar), eftersom det är den naturliga
  // "ångra"-vägen ut ur kortet.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void handleCancel()
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
  // `room`-propen är en engångssnapshot från föräldern (satt när kortet öppnades) och uppdateras
  // aldrig av sig själv – en live-fråga på rummets egen post behövs för att koppling/frigöring
  // till ett typrum (som bara skriver till databasen) ska synas direkt i kortet.
  const liveRoom = useLiveQuery(() => db.rooms.get(room.id), [room.id]) ?? room
  const linkedType = useLiveQuery(
    () => (liveRoom.roomTypeId ? db.roomTypes.get(liveRoom.roomTypeId) : undefined),
    [liveRoom.roomTypeId],
  )
  const roomTypes = useLiveQuery(
    () => (showTypeMenu ? db.roomTypes.where('projectId').equals(projectId).sortBy('name') : Promise.resolve<RoomType[]>([])),
    [projectId, showTypeMenu],
  )

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
      if (!value || !record || liveRoom.roomTypeId) return
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

  const setField = <K extends keyof Loaded>(key: K, value: Loaded[K]) => {
    setLoaded((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const setCategoryEntry = (category: RoomCategory, updater: (prev: CategoryEntry) => CategoryEntry) =>
    setLoaded((prev) => (prev ? { ...prev, categories: { ...prev.categories, [category]: updater(prev.categories[category]) } } : prev))

  const handleLinkType = async (type: RoomType) => {
    await linkRoomToType(room, type)
    setShowTypeMenu(false)
  }

  // Kopierar typrummets data en gång, UTAN att koppla rummet till det – till skillnad från
  // handleLinkType skapas ingen stående koppling, så rummet kan avvika direkt efteråt.
  const handleApplyTypeOnce = async (type: RoomType) => {
    if (!record) return
    const confirmed = await confirmDialog(
      `Kopiera in all data från typrummet "${type.name}" i rummet? Rummets befintliga data skrivs över, men rummet kopplas INTE till typrummet.`,
      { danger: true, confirmLabel: 'Skriv över' },
    )
    if (!confirmed) return
    await applyRoomTypeDataOnce(room, type)
    // Se handleUnlinkType nedan – satt direkt istället för nollställd, av samma anledning.
    setLoaded({
      recordId: record.id,
      categories: type.categories,
      antalPersoner: type.antalPersoner,
      funktionsbeskrivning: type.funktionsbeskrivning,
      dagsljus: type.dagsljus,
      storlek: type.storlek,
    })
    setShowTypeMenu(false)
  }

  // Skapar ett nytt typrum i projektets bibliotek utifrån rummets NUVARANDE data – en
  // engångskopia (inte en koppling), så man kan göra en mall av ett rum man redan fyllt i.
  const handleCreateTypeFromRoom = async () => {
    const newType = await createRoomTypeFromRoom(room)
    setTypeMenuMessage(`Typrummet "${newType.name}" har skapats. Hantera det under Typrum i projektets inställningar.`)
  }

  const handleUnlinkType = async () => {
    if (!linkedType || !record) return
    await unlinkRoomFromType(room, linkedType)
    // unlinkRoomFromType skriver typrummets data direkt till rummets egen (oförändrade)
    // inventeringspost – samma post-id som innan, så effekten som annars synkar `loaded` från
    // `record` (styrd av att post-id:t ändras) triggar inte av sig själv. Sätts direkt till den
    // data vi just skrev istället för att nollställas och vänta på att liveQuery:n hinner ikapp –
    // det race:et kunde annars lämna kortet fast på "Laddar…".
    setLoaded({
      recordId: record.id,
      categories: linkedType.categories,
      antalPersoner: linkedType.antalPersoner,
      funktionsbeskrivning: linkedType.funktionsbeskrivning,
      dagsljus: linkedType.dagsljus,
      storlek: linkedType.storlek,
    })
    setShowTypeMenu(false)
  }

  const handleClearRoomData = async () => {
    if (!record) return
    const confirmed = await confirmDialog('Rensa all inventeringsdata för rummet? Detta går inte att ångra.', {
      danger: true,
    })
    if (!confirmed) return
    const cleared = {
      categories: emptyCategories(),
      antalPersoner: '',
      funktionsbeskrivning: '',
      dagsljus: '',
      storlek: '',
    }
    await db.inventoryRecords.update(record.id, { ...cleared, updatedAt: Date.now() })
    // Se handleUnlinkType ovan – satt direkt istället för nollställd, av samma anledning.
    setLoaded({ recordId: record.id, ...cleared })
  }

  // Ett rum kopplat till ett typrum visar alltid typrummets data, aldrig rummets egen (dolda och
  // orörd) inventeringspost, och går inte att redigera eller skapa taggar i direkt.
  const effective: Loaded | null = linkedType
    ? {
        recordId: linkedType.id,
        categories: linkedType.categories,
        antalPersoner: linkedType.antalPersoner,
        funktionsbeskrivning: linkedType.funktionsbeskrivning,
        dagsljus: linkedType.dagsljus,
        storlek: linkedType.storlek,
      }
    : loaded

  return (
    <div className="modal-backdrop inventory-sheet-backdrop" onClick={() => void handleCancel()}>
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
            {linkedType && <span className="room-type-badge">Typrum: {linkedType.name}</span>}
          </div>
          <div className="inventory-sheet-header-actions">
            {!linkedType && (
              <button
                type="button"
                className="btn-ghost btn tap-target"
                onClick={() => void handleClearRoomData()}
                aria-label="Rensa rumsdata"
                title="Rensa rumsdata"
              >
                <EraserIcon width={20} height={20} />
              </button>
            )}
            <button
              type="button"
              className="btn-ghost btn tap-target room-type-link-btn"
              onClick={() => {
                setShowTypeMenu((open) => !open)
                setTypeMenuMessage(null)
              }}
              aria-label={linkedType ? `Kopplad till typrummet ${linkedType.name}` : 'Koppla till typrum'}
              title={linkedType ? `Kopplad till typrummet ${linkedType.name}` : 'Koppla till typrum'}
            >
              {linkedType ? (
                <LinkIcon width={24} height={24} className="room-type-link-active" />
              ) : (
                <LinkOffIcon width={24} height={24} />
              )}
            </button>
            <span className="field-hint save-status" data-status={status}>
              {STATUS_LABEL[status]}
            </span>
          </div>
        </div>

        {showTypeMenu && (
          <div className="room-type-menu">
            {linkedType ? (
              <>
                <p className="field-hint">Rummet är kopplat till typrummet "{linkedType.name}" och ärver all dess data.</p>
                <button type="button" className="btn btn-secondary" onClick={() => void handleUnlinkType()}>
                  Frigör rum från typrum
                </button>
              </>
            ) : (
              <>
                <p className="field-hint">
                  Koppla rummet till ett typrum för att ärva dess data, eller använd ett typrums data en gång utan att binda
                  rummet till det:
                </p>
                {roomTypes === undefined ? (
                  <p className="field-hint">Laddar…</p>
                ) : roomTypes.length === 0 ? (
                  <p className="field-hint">Inga typrum skapade ännu.</p>
                ) : (
                  <div className="room-type-menu-list">
                    {roomTypes.map((type) => (
                      <div key={type.id} className="room-type-menu-row">
                        <span className="room-type-menu-row-name">{type.name}</span>
                        <div className="room-type-menu-row-actions">
                          <button type="button" className="btn btn-secondary" onClick={() => void handleApplyTypeOnce(type)}>
                            Använd en gång
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={() => void handleLinkType(type)}>
                            Koppla
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" className="btn btn-secondary room-type-menu-create" onClick={() => void handleCreateTypeFromRoom()}>
                  + Skapa typrum från rummet
                </button>
                {typeMenuMessage && <p className="field-hint">{typeMenuMessage}</p>}
              </>
            )}
          </div>
        )}

        {/* Dold medan menyn är öppen – att visa både menyns "ärver all data från X" och hela den
           ärvda arbetsytan samtidigt kändes rörigt och redundant. flex:1 fyller ut resten av det
           (fasta, se .inventory-sheet) höjdutrymmet så att footern alltid hamnar på exakt samma
           plats längst ner, oavsett hur mycket innehåll det aktiva arbetsläget råkar ha. */}
        {!showTypeMenu && (
          <div className="inventory-sheet-content">
            {loadError ? (
              <p className="field-hint" style={{ color: 'var(--color-danger)' }}>
                {loadError}
              </p>
            ) : effective === null ? (
              <p className="field-hint">Laddar…</p>
            ) : (
              <InventoryWorkspace
                projectId={projectId}
                roomId={room.id}
                categories={effective.categories}
                setCategoryEntry={setCategoryEntry}
                funktion={{
                  antalPersoner: effective.antalPersoner,
                  funktionsbeskrivning: effective.funktionsbeskrivning,
                  dagsljus: effective.dagsljus,
                  storlek: effective.storlek,
                }}
                setFunktionField={(key, value) => setField(key, value)}
                readOnly={Boolean(linkedType)}
                onTagCreated={(tagId) => createdTagIdsRef.current.add(tagId)}
              />
            )}
          </div>
        )}

        {!showTypeMenu && (
          <div className="modal-actions inventory-sheet-footer">
            <button className="btn" style={{ color: 'var(--color-danger)' }} onClick={() => void handleDeleteRoom()}>
              Ta bort rum
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
        )}
      </div>
    </div>
  )
}
