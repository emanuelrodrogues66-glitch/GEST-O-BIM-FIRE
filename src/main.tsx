import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import PontoPage from './components/PontoPage.tsx'

// O cartão ponto mora em /ponto, endereço próprio: dá para abrir numa aba
// separada, deixar fixa no computador da recepção ou salvar como atalho no
// celular, sem carregar o quadro de projetos junto.
const noPonto = window.location.pathname.replace(/\/+$/, '') === '/ponto'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{noPonto ? <PontoPage /> : <App />}</StrictMode>,
)
