import { Route, Routes } from 'react-router-dom'
import ProjectListPage from './pages/ProjectListPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import DrawingViewerPage from './pages/DrawingViewerPage'
import TagsPage from './features/tags/TagsPage'
import RoomTypesPage from './features/roomTypes/RoomTypesPage'
import { ConfirmDialogHost } from './components/ConfirmDialog'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<ProjectListPage />} />
        <Route path="/project/:projectId" element={<ProjectDetailPage />} />
        <Route path="/project/:projectId/tags" element={<TagsPage />} />
        <Route path="/project/:projectId/room-types" element={<RoomTypesPage />} />
        <Route path="/project/:projectId/viewer/:drawingPageId" element={<DrawingViewerPage />} />
      </Routes>
      <ConfirmDialogHost />
    </>
  )
}
