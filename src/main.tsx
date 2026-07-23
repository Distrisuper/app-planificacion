import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { captureInitialURL } from '@/utils/initialURLCapture'
import './index.css'
import App from './App.tsx'

// MUST run before React mounts (mirrors app-vendedores).
const capture = captureInitialURL()
if (capture.params.token) {
  localStorage.setItem('access_token', capture.params.token)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
