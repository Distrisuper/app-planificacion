import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { captureInitialURL } from '@/utils/initialURLCapture'
import { adoptarTokenDeUrl } from '@/lib/sesionLocal'
import './index.css'
import App from './App.tsx'

// MUST run before React mounts (mirrors app-vendedores).
const capture = captureInitialURL()
if (capture.params.token) {
  // Si es de otra sesión, limpia lo que dejó la anterior (visita en curso, borradores).
  adoptarTokenDeUrl(capture.params.token)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
