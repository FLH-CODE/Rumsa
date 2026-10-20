import { Route, Routes } from 'react-router-dom'
import ProjectListPage from './pages/ProjectListPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import DrawingViewerPage from './pages/DrawingViewerPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ProjectListPage />} />
      <Route path="/project/:projectId" element={<ProjectDetailPage />} />
      <Route path="/project/:projectId/viewer/:drawingPageId" element={<DrawingViewerPage />} />
    </Routes>
  )
}
