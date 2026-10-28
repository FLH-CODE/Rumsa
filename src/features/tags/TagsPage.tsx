import { useNavigate, useParams } from 'react-router-dom'
import type { Room } from '../../db'
import { TagsOverviewPanel } from './TagsOverviewPanel'
import { confirmDialog } from '../../components/ConfirmDialog'

/** Ruttversionen av taggöversikten (nås från projektets inställningslista) – stängs genom att
 * navigera tillbaka till projektet. Se TagsOverviewPanel för själva innehållet, som även
 * används som overlay direkt i ritningsvisaren och rumskortet. */
export default function TagsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  if (!projectId) return null

  const handleOpenRoom = async (room: Room) => {
    const confirmed = await confirmDialog(`Gå till ritningen för rum ${room.roomNumber || room.roomName}?`)
    if (!confirmed) return
    navigate(`/project/${projectId}/viewer/${room.drawingPageId}`, { state: { openRoomId: room.id } })
  }

  return (
    <TagsOverviewPanel
      projectId={projectId}
      onClose={() => navigate(`/project/${projectId}`)}
      onOpenRoom={(room) => void handleOpenRoom(room)}
    />
  )
}
