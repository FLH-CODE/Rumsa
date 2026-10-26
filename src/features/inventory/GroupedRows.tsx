import { useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { db, createId, type InventoryRow, type RoomCardGroup } from '../../db'
import { deleteRoomCardGroupCascade } from '../data/cascadeDelete'
import { GripIcon, ChevronRightIcon, TrashIcon } from '../../components/icons'
import { confirmOnEnterEscape } from '../../utils/keyboardShortcuts'

/** Pseudo-grupp-id för rader som inte hör till någon namngiven grupp än. */
const UNGROUPED = '__ungrouped__'

function bucketKeyOf(row: InventoryRow, knownGroupIds: Set<string>): string {
  return row.groupId && knownGroupIds.has(row.groupId) ? row.groupId : UNGROUPED
}

/** Bygger ordnade hinkar (grupp-id → radernas id i ordning) utifrån radernas nuvarande ordning
 * och groupId, så att varje grupps inbördes ordning bevaras exakt som den visas. */
function buildBuckets(rows: InventoryRow[], groupIds: string[]): Map<string, string[]> {
  const buckets = new Map<string, string[]>()
  buckets.set(UNGROUPED, [])
  for (const id of groupIds) buckets.set(id, [])
  for (const row of rows) {
    const key = bucketKeyOf(row, new Set(groupIds))
    buckets.get(key)!.push(row.id)
  }
  return buckets
}

function flattenBuckets(bucketOrder: string[], buckets: Map<string, string[]>, rowById: Map<string, InventoryRow>): InventoryRow[] {
  const result: InventoryRow[] = []
  for (const key of bucketOrder) {
    for (const id of buckets.get(key) ?? []) {
      const row = rowById.get(id)
      if (!row) continue
      const groupId = key === UNGROUPED ? null : key
      result.push(row.groupId === groupId ? row : { ...row, groupId })
    }
  }
  return result
}

/**
 * Rumskortets rader, organiserade i namngivna grupper som delas av hela projektet (samma
 * grupper/ordning/ihopfällning oavsett vilket rum man öppnar). Rader går att dra både inom och
 * mellan grupper, och grupperna går att dra om sinsemellan. Utan grupper visas raderna precis
 * som innan – gruppering är helt valfritt.
 */
export function GroupedRows({
  projectId,
  rows,
  onRowsChange,
  renderRow,
}: {
  projectId: string
  rows: InventoryRow[]
  onRowsChange: (rows: InventoryRow[]) => void
  renderRow: (row: InventoryRow) => ReactNode
}) {
  const groups = useLiveQuery(
    () => db.roomCardGroups.where('projectId').equals(projectId).sortBy('order'),
    [projectId],
  )
  const [namingGroup, setNamingGroup] = useState<{ group: RoomCardGroup | null } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  if (groups === undefined) return null

  const groupIds = groups.map((g) => g.id)
  const rowById = new Map(rows.map((r) => [r.id, r]))
  const buckets = buildBuckets(rows, groupIds)
  const bucketOrder = [UNGROUPED, ...groupIds]
  const allCollapsed = groups.length > 0 && groups.every((g) => g.collapsed)

  const handleToggleAll = () => {
    void Promise.all(groups.map((g) => db.roomCardGroups.update(g.id, { collapsed: !allCollapsed })))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const activeType = active.data.current?.type
    const overId = String(over.id)

    if (activeType === 'group') {
      if (active.id === over.id) return
      const oldIndex = groups.findIndex((g) => g.id === active.id)
      const newIndex = groups.findIndex((g) => g.id === overId)
      if (oldIndex === -1 || newIndex === -1) return
      const reordered = arrayMove(groups, oldIndex, newIndex)
      void Promise.all(reordered.map((g, i) => (g.order === i ? null : db.roomCardGroups.update(g.id, { order: i }))))
      return
    }

    // Drar en rad: hitta käll- och målhink, flytta id:t, bygg om hela radlistan.
    const activeId = String(active.id)
    let sourceKey: string | null = null
    for (const [key, ids] of buckets) {
      if (ids.includes(activeId)) {
        sourceKey = key
        break
      }
    }
    if (sourceKey === null) return

    let targetKey: string | null = null
    let targetIsRow = false
    for (const [key, ids] of buckets) {
      if (ids.includes(overId)) {
        targetKey = key
        targetIsRow = true
        break
      }
    }
    if (targetKey === null) {
      // Släppt direkt på en (eventuellt tom) grupps droppzon, inte på en specifik rad.
      targetKey = bucketOrder.includes(overId) ? overId : null
    }
    if (targetKey === null) return

    const sourceIds = [...(buckets.get(sourceKey) ?? [])]
    const fromIndex = sourceIds.indexOf(activeId)
    sourceIds.splice(fromIndex, 1)
    buckets.set(sourceKey, sourceIds)

    const targetIds = sourceKey === targetKey ? sourceIds : [...(buckets.get(targetKey) ?? [])]
    let toIndex = targetIsRow ? targetIds.indexOf(overId) : targetIds.length
    if (toIndex === -1) toIndex = targetIds.length
    targetIds.splice(toIndex, 0, activeId)
    buckets.set(targetKey, targetIds)

    onRowsChange(flattenBuckets(bucketOrder, buckets, rowById))
  }

  const ungroupedIds = buckets.get(UNGROUPED) ?? []

  return (
    <div className="grouped-rows">
      {groups.length > 0 && (
        <div className="grouped-rows-toolbar">
          <button type="button" className="btn-ghost-light" onClick={handleToggleAll}>
            {allCollapsed ? 'Visa allt' : 'Fäll ihop allt'}
          </button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {ungroupedIds.length > 0 && (
          <RowBucket bucketId={UNGROUPED} rowIds={ungroupedIds} rowById={rowById} renderRow={renderRow} />
        )}

        <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
          {groups.map((group) => (
            <GroupSection
              key={group.id}
              group={group}
              rowIds={buckets.get(group.id) ?? []}
              rowById={rowById}
              renderRow={renderRow}
              onRename={() => setNamingGroup({ group })}
              onDelete={() => {
                if (confirm(`Ta bort gruppen "${group.name}"? Raderna i den finns kvar, men blir ogrupperade.`)) {
                  void deleteRoomCardGroupCascade(projectId, group.id)
                }
              }}
            />
          ))}
        </SortableContext>
      </DndContext>

      <button type="button" className="material-add-btn" onClick={() => setNamingGroup({ group: null })}>
        + Ny grupp
      </button>

      {namingGroup && (
        <GroupNameSheet
          projectId={projectId}
          group={namingGroup.group}
          nextOrder={groups.length}
          onClose={() => setNamingGroup(null)}
        />
      )}
    </div>
  )
}

function RowBucket({
  bucketId,
  rowIds,
  rowById,
  renderRow,
}: {
  bucketId: string
  rowIds: string[]
  rowById: Map<string, InventoryRow>
  renderRow: (row: InventoryRow) => ReactNode
}) {
  const { setNodeRef } = useDroppable({ id: bucketId })
  return (
    <div ref={setNodeRef} className="row-bucket">
      <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
        {rowIds.map((id) => {
          const row = rowById.get(id)
          if (!row) return null
          return (
            <SortableRow key={id} id={id}>
              {renderRow(row)}
            </SortableRow>
          )
        })}
      </SortableContext>
    </div>
  )
}

function SortableRow({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { type: 'row' },
  })
  return (
    <div
      ref={setNodeRef}
      className={`inventory-row${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button type="button" className="row-drag-handle" aria-label="Dra för att flytta raden" {...attributes} {...listeners}>
        <GripIcon width={18} height={18} />
      </button>
      <div className="inventory-row-content">{children}</div>
    </div>
  )
}

function GroupSection({
  group,
  rowIds,
  rowById,
  renderRow,
  onRename,
  onDelete,
}: {
  group: RoomCardGroup
  rowIds: string[]
  rowById: Map<string, InventoryRow>
  renderRow: (row: InventoryRow) => ReactNode
  onRename: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef: setSortableRef, transform, transition, isDragging } = useSortable({
    id: group.id,
    data: { type: 'group' },
  })
  const { setNodeRef: setDroppableRef } = useDroppable({ id: group.id })

  return (
    <div
      ref={setSortableRef}
      className={`row-group${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="row-group-header">
        <button type="button" className="row-drag-handle" aria-label="Dra för att flytta gruppen" {...attributes} {...listeners}>
          <GripIcon width={18} height={18} />
        </button>
        <button
          type="button"
          className="row-group-toggle"
          onClick={() => void db.roomCardGroups.update(group.id, { collapsed: !group.collapsed })}
        >
          <ChevronRightIcon className={`row-group-chevron${group.collapsed ? '' : ' open'}`} width={16} height={16} />
          <span onClick={(e) => { e.stopPropagation(); onRename() }} role="button" tabIndex={0}>
            {group.name}
          </span>
          {rowIds.length > 0 && <span className="field-hint">({rowIds.length})</span>}
        </button>
        <button type="button" className="row-group-delete" aria-label={`Ta bort gruppen ${group.name}`} onClick={onDelete}>
          <TrashIcon width={16} height={16} />
        </button>
      </div>
      {!group.collapsed && (
        <div ref={setDroppableRef} className="row-bucket">
          <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
            {rowIds.map((id) => {
              const row = rowById.get(id)
              if (!row) return null
              return (
                <SortableRow key={id} id={id}>
                  {renderRow(row)}
                </SortableRow>
              )
            })}
          </SortableContext>
          {rowIds.length === 0 && <p className="field-hint row-group-empty">Dra en rad hit</p>}
        </div>
      )}
    </div>
  )
}

function GroupNameSheet({
  projectId,
  group,
  nextOrder,
  onClose,
}: {
  projectId: string
  group: RoomCardGroup | null
  nextOrder: number
  onClose: () => void
}) {
  const [name, setName] = useState(group?.name ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true)
    try {
      if (group) {
        await db.roomCardGroups.update(group.id, { name: trimmed })
      } else {
        await db.roomCardGroups.add({ id: createId(), projectId, name: trimmed, order: nextOrder, collapsed: false })
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>{group ? 'Byt namn på grupp' : 'Ny grupp'}</h2>
        <div className="field">
          <label htmlFor="group-name">Namn</label>
          <input
            id="group-name"
            autoFocus
            value={name}
            placeholder="t.ex. Golv"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={confirmOnEnterEscape(() => void handleSave(), onClose)}
          />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Avbryt
          </button>
          <button className="btn btn-primary" onClick={() => void handleSave()} disabled={!name.trim() || saving}>
            {saving ? 'Sparar…' : 'Spara'}
          </button>
        </div>
      </div>
    </div>
  )
}
