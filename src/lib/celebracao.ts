import confetti from 'canvas-confetti'

/**
 * Comemoração ao concluir um projeto: confete na tela e um toque curto.
 *
 * O som é sintetizado na hora com a Web Audio API — não há arquivo para baixar
 * nem dependência externa, e o toque sai igual em qualquer navegador.
 */

const CHAVE_CONFETE = 'bimfire:comemoracao:confete'
const CHAVE_SOM = 'bimfire:comemoracao:som'
const CHAVE_ALERTA = 'bimfire:alerta:correcao'

function ler(chave: string): boolean {
  try {
    // Ausente = ligado, para a comemoração funcionar sem configurar nada.
    return localStorage.getItem(chave) !== 'off'
  } catch {
    return true
  }
}

function gravar(chave: string, ligado: boolean) {
  try {
    localStorage.setItem(chave, ligado ? 'on' : 'off')
  } catch {
    // Navegador sem armazenamento: só não guarda a preferência.
  }
}

export const comemoracao = {
  confeteLigado: () => ler(CHAVE_CONFETE),
  somLigado: () => ler(CHAVE_SOM),
  alertaLigado: () => ler(CHAVE_ALERTA),
  setConfete: (v: boolean) => gravar(CHAVE_CONFETE, v),
  setSom: (v: boolean) => gravar(CHAVE_SOM, v),
  setAlerta: (v: boolean) => gravar(CHAVE_ALERTA, v),
}

/** Toque ascendente curto — sensação de "conquista", sem ser estridente. */
function tocarSom() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()

    // Dó, Mi, Sol, Dó — arpejo maior, tocado em sequência rápida.
    const notas = [523.25, 659.25, 783.99, 1046.5]
    const inicio = ctx.currentTime

    notas.forEach((freq, i) => {
      const t = inicio + i * 0.09
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, t)

      // Envelope suave: sobe rápido e decai, para não estalar.
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.45)
    })

    // Libera o contexto depois que o som termina.
    setTimeout(() => ctx.close().catch(() => {}), 1200)
  } catch {
    // Som é enfeite: se o navegador bloquear, o resto segue normalmente.
  }
}

/** Confete em duas rajadas laterais, nas cores da marca. */
function soltarConfete() {
  const cores = ['#22c55e', '#facc15', '#38bdf8', '#f472b6', '#9E1B14', '#E8A33D']

  confetti({
    particleCount: 90,
    spread: 70,
    origin: { y: 0.6 },
    colors: cores,
    zIndex: 9999,
  })

  setTimeout(() => {
    confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0, y: 0.65 }, colors: cores, zIndex: 9999 })
    confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1, y: 0.65 }, colors: cores, zIndex: 9999 })
  }, 180)
}

/**
 * Dispara a comemoração respeitando as preferências do usuário.
 * `quantidade` acima de 1 (conclusão em massa) reforça o confete.
 */
export function comemorarConclusao(quantidade = 1) {
  if (comemoracao.confeteLigado()) {
    soltarConfete()
    // Vários projetos de uma vez merecem uma segunda leva.
    if (quantidade > 1) setTimeout(soltarConfete, 500)
  }
  if (comemoracao.somLigado()) tocarSom()
}

// ---------------------------------------------------------------------------
// Alerta de correção
// ---------------------------------------------------------------------------

/** Dois bipes graves e descendentes — timbre de aviso, não de comemoração. */
function tocarAlerta() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const inicio = ctx.currentTime

    // Duas notas descendentes, repetidas: sensação de "atenção".
    const bipes = [
      { freq: 466.16, t: 0 },
      { freq: 349.23, t: 0.18 },
      { freq: 466.16, t: 0.42 },
      { freq: 349.23, t: 0.6 },
    ]

    bipes.forEach((b) => {
      const t = inicio + b.t
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'square'
      osc.frequency.setValueAtTime(b.freq, t)

      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.09, t + 0.015)
      gain.gain.setValueAtTime(0.09, t + 0.12)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.17)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.18)
    })

    setTimeout(() => ctx.close().catch(() => {}), 1400)
  } catch {
    // Sem áudio, o aviso visual já cumpre o papel.
  }
}

/**
 * Aviso visual: uma moldura vermelha pulsa nas bordas da tela e um cartão
 * informa qual projeto entrou em correção. Some sozinho em alguns segundos.
 */
function mostrarAlertaVisual(nomeProjeto?: string) {
  const ID_ESTILO = 'bimfire-alerta-estilo'
  if (!document.getElementById(ID_ESTILO)) {
    const estilo = document.createElement('style')
    estilo.id = ID_ESTILO
    estilo.textContent = `
      @keyframes bimfire-pulso {
        0%, 100% { opacity: 0; }
        20%, 60%  { opacity: 1; }
      }
      @keyframes bimfire-entrada {
        from { opacity: 0; transform: translate(-50%, -12px); }
        to   { opacity: 1; transform: translate(-50%, 0); }
      }
      @keyframes bimfire-saida {
        to { opacity: 0; transform: translate(-50%, -12px); }
      }
    `
    document.head.appendChild(estilo)
  }

  // Moldura vermelha piscando nas bordas
  const moldura = document.createElement('div')
  moldura.style.cssText = [
    'position:fixed', 'inset:0', 'pointer-events:none', 'z-index:9998',
    'box-shadow: inset 0 0 0 6px #ef4444, inset 0 0 60px rgba(239,68,68,.45)',
    'animation: bimfire-pulso 0.75s ease-in-out 2',
  ].join(';')
  document.body.appendChild(moldura)

  // Cartão de aviso no topo
  const aviso = document.createElement('div')
  aviso.style.cssText = [
    'position:fixed', 'top:18px', 'left:50%', 'transform:translateX(-50%)',
    'z-index:9999', 'pointer-events:none',
    'background:#991b1b', 'color:#fff',
    'padding:12px 20px', 'border-radius:12px',
    'box-shadow:0 12px 32px rgba(0,0,0,.28)',
    'font-family:system-ui,-apple-system,Segoe UI,sans-serif',
    'display:flex', 'align-items:center', 'gap:12px',
    'max-width:min(92vw, 520px)',
    'animation: bimfire-entrada .22s ease-out',
  ].join(';')

  const icone = document.createElement('div')
  icone.textContent = '!'
  icone.style.cssText = [
    'flex:0 0 auto', 'width:28px', 'height:28px', 'border-radius:50%',
    'background:#fff', 'color:#991b1b',
    'display:flex', 'align-items:center', 'justify-content:center',
    'font-weight:700', 'font-size:18px', 'line-height:1',
  ].join(';')

  const texto = document.createElement('div')
  const titulo = document.createElement('div')
  titulo.textContent = 'Projeto em CORREÇÃO'
  titulo.style.cssText = 'font-weight:700;font-size:14px;letter-spacing:.3px'
  texto.appendChild(titulo)

  if (nomeProjeto) {
    const sub = document.createElement('div')
    sub.textContent = nomeProjeto
    sub.style.cssText = 'font-size:12.5px;opacity:.92;margin-top:2px'
    texto.appendChild(sub)
  }

  aviso.appendChild(icone)
  aviso.appendChild(texto)
  document.body.appendChild(aviso)

  setTimeout(() => moldura.remove(), 1600)
  setTimeout(() => {
    aviso.style.animation = 'bimfire-saida .25s ease-in forwards'
    setTimeout(() => aviso.remove(), 300)
  }, 3600)
}

/** Alerta disparado quando um projeto passa para CORREÇÃO. */
export function alertarCorrecao(nomeProjeto?: string, quantidade = 1) {
  if (comemoracao.alertaLigado()) {
    mostrarAlertaVisual(
      quantidade > 1 ? `${quantidade} projetos entraram em correção` : nomeProjeto
    )
  }
  if (comemoracao.somLigado()) tocarAlerta()
}
