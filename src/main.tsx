import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { LandingPage } from './components/LandingPage'
import { Editor } from './Editor'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/:gameId" element={<Editor />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
)
