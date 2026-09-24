import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import PontoPage from './components/PontoPage.tsx'
import ComercialPage from './components/ComercialPage.tsx'
import MefPage from './components/MefPage.tsx'
import FormularioParceiro from './components/FormularioParceiro.tsx'

// O cartão ponto mora em /ponto, endereço próprio: dá para abrir numa aba
// separada, deixar fixa no computador da recepção ou salvar como atalho no
// celular, sem carregar o quadro de projetos junto.
const rota = window.location.pathname.replace(/\/+$/, '')

/**
 * O cadastro de parceiros tem endereço próprio.
 *
 * É um link que vai por WhatsApp para gente que nunca ouviu falar da gente.
 * Chegar num endereço com "gestão de projetos" no meio parece sistema interno
 * aberto por engano; "cadastro-parceiros-bimfire" diz o que é. O mesmo app
 * responde nos dois endereços — muda só o que ele mostra.
 */
const souOCadastro = window.location.hostname.startsWith('cadastro-parceiros')
const ehFormulario = souOCadastro || rota === '/parceiro'

document.title = ehFormulario
  ? 'Cadastro de Parceiros — BIM Fire'
  : rota === '/comercial'
    ? 'Comercial — BIM Fire'
    : rota === '/ponto'
      ? 'Cartão Ponto — BIM Fire'
      : rota === '/mef'
        ? 'MEF Instalações'
        : 'Gestão de Projetos — BIM Fire'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {ehFormulario ? (
      <FormularioParceiro />
    ) : rota === '/ponto' ? (
      <PontoPage />
    ) : rota === '/comercial' ? (
      <ComercialPage />
    ) : rota === '/mef' ? (
      <MefPage />

    ) : (
      <App />
    )}
  </StrictMode>,
)
