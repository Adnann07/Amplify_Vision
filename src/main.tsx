import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion={import.meta.env.PROD ? 'user' : 'never'}>
      <App />
    </MotionConfig>
  </StrictMode>,
)
