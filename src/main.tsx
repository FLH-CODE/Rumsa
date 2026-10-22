import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
import './devtools'
import './pwaUpdate'

// HashRouter (inte BrowserRouter) eftersom appen körs från statisk hosting (GitHub Pages)
// utan server-side rewrites – annars ger en sidomladdning på en djuplänk 404.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
