import { useEffect, useState } from 'react'

/**
 * Bandeira do Brasil tremulando na barra do topo, e o tema verde-amarelo
 * que vem com ela.
 *
 * O mes combinado e outubro de 2026: entra sozinho no dia 1 e sai sozinho
 * no dia 1 de novembro. Quem nao quiser clica na bandeira e desliga; a
 * escolha vale para aquele navegador e tem prioridade sobre o calendario.
 *
 * O tecido e dois movimentos somados: o pano inteiro balancando (CSS) e a
 * ondulacao miuda do pano (filtro de turbulencia), mais uma luz passando
 * por cima para dar a impressao de dobra.
 */
const CHAVE = 'bimfire.temaBrasil'
const MES_DO_BRASIL = { ano: 2026, mes: 10 }

export function mesDoBrasil(d = new Date()) {
  return d.getFullYear() === MES_DO_BRASIL.ano && d.getMonth() + 1 === MES_DO_BRASIL.mes
}

function escolhaSalva(): boolean | null {
  try {
    const v = localStorage.getItem(CHAVE)
    if (v === 'on') return true
    if (v === 'off') return false
  } catch {
    /* navegador sem storage: segue o calendario */
  }
  return null
}

export default function BandeiraBrasil() {
  const [ligado, setLigado] = useState(() => escolhaSalva() ?? mesDoBrasil())

  useEffect(() => {
    document.documentElement.classList.toggle('tema-brasil', ligado)
    try {
      localStorage.setItem(CHAVE, ligado ? 'on' : 'off')
    } catch {
      /* sem storage: o tema vale so nesta aba */
    }
  }, [ligado])

  // Fora do mes, e sem ninguem ter ligado na mao, nao aparece nada.
  if (!ligado && !mesDoBrasil()) return null

  return (
    <button
      type="button"
      onClick={() => setLigado((v) => !v)}
      title={
        ligado
          ? 'Tema do Brasil ligado — clique para voltar ao vermelho da BIM Fire'
          : 'Clique para ligar o tema do Brasil'
      }
      className={
        'shrink-0 rounded transition ' + (ligado ? 'opacity-100' : 'opacity-30 hover:opacity-70')
      }
      aria-label="Tema do Brasil"
    >
      <svg
        viewBox="0 0 60 42"
        className={ligado ? 'h-7 w-10 bandeira-tremula' : 'h-7 w-10'}
        role="img"
        aria-hidden="true"
      >
        <defs>
          <filter id="bandeira-onda" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.02 0.06"
              numOctaves="2"
              seed="3"
              result="ruido"
            >
              <animate
                attributeName="baseFrequency"
                dur="9s"
                values="0.02 0.06;0.025 0.075;0.02 0.06"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap
              in="SourceGraphic"
              in2="ruido"
              scale="1.6"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
          <linearGradient id="bandeira-luz" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="40%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="70%" stopColor="#000000" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
            <animate attributeName="x1" dur="4.5s" values="-1;0.6;-1" repeatCount="indefinite" />
            <animate attributeName="x2" dur="4.5s" values="0;1.6;0" repeatCount="indefinite" />
          </linearGradient>
        </defs>

        <g filter="url(#bandeira-onda)">
          <rect width="60" height="42" rx="1.5" fill="#009739" />
          <path d="M30 4.2 55.5 21 30 37.8 4.5 21Z" fill="#FEDD00" />
          <circle cx="30" cy="21" r="9.2" fill="#012169" />
          <path
            d="M21.4 17.6a22 22 0 0 1 17.6 2.1 9.2 9.2 0 0 1-.3 3.1 25 25 0 0 0-17.9-2.4 9.2 9.2 0 0 1 .6-2.8Z"
            fill="#ffffff"
          />
          <g fill="#ffffff">
            <circle cx="26.2" cy="16.1" r="0.5" />
            <circle cx="30.4" cy="15.4" r="0.6" />
            <circle cx="34.6" cy="16.6" r="0.45" />
            <circle cx="27.4" cy="25.6" r="0.55" />
            <circle cx="31.6" cy="26.4" r="0.5" />
            <circle cx="35.4" cy="24.2" r="0.45" />
            <circle cx="24.1" cy="22.8" r="0.4" />
            <circle cx="30" cy="22.6" r="0.4" />
            <circle cx="33.2" cy="28.1" r="0.4" />
          </g>
          <rect width="60" height="42" rx="1.5" fill="url(#bandeira-luz)" />
        </g>
      </svg>
    </button>
  )
}
