import { useNavigate, useParams } from 'react-router-dom'
import { TagsOverviewPanel } from './TagsOverviewPanel'

/** Ruttversionen av taggöversikten (nås från projektets inställningslista) – stängs genom att
 * navigera tillbaka till projektet. Se TagsOverviewPanel för själva innehållet, som även
 * används som overlay direkt i ritningsvisaren och rumskortet. */
export default function TagsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  if (!projectId) return null
  return <TagsOverviewPanel projectId={projectId} onClose={() => navigate(`/project/${projectId}`)} />
}
