import confetti from 'canvas-confetti'

/**
 * Comemoração ao concluir um projeto: confete na tela e um toque curto.
 *
 * O som é sintetizado na hora com a Web Audio API — não há arquivo para baixar
 * nem dependência externa, e o toque sai igual em qualquer navegador.
 */

const CHAVE_CONFETE = 'bimfire:comemoracao:confete'
const CHAVE_SOM = 'bimfire:comemoracao:som'

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
  setConfete: (v: boolean) => gravar(CHAVE_CONFETE, v),
  setSom: (v: boolean) => gravar(CHAVE_SOM, v),
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
