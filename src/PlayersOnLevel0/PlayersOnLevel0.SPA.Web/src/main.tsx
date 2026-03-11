import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { darkTheme } from './theme/theme.css'
import './theme/global.css'
import { WelcomePage } from './pages/WelcomePage'
import { PlayerPage } from './pages/PlayerPage'
import { ApiDocsPage } from './pages/ApiDocsPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <div className={darkTheme}>
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/docs" element={<ApiDocsPage />} />
          <Route path="/:playerId" element={<PlayerPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  </StrictMode>,
)
