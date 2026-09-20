// src/main.jsx
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

if ('serviceWorker' in navigator) window.addEventListener('load',async()=>{try{const reg=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});await reg.update()}catch{}})
