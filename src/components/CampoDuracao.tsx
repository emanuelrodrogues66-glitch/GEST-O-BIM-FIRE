import { useEffect, useRef, useState } from 'react'

/**
 * Duração em horas E minutos.
 *
 * O banco guarda hora decimal, porque é o que vira custo e ponto. Só que
 * ninguém trabalha pensando em "1,75" — quem passou uma hora e quarenta no
 * projeto quer digitar 1 e 40. Pedir a conversão de cabeça é onde os
 * projetistas se confundiam: 1h30 virava 1,30 e o custo saía errado.
 *
 * Então a tela pede hora e minuto separados e a conta fica aqui.
 */

/** 1.75 -> { h: '1', m: '45' } */
function partir(decimal: string): { h: string; m: string } {
  const n = Number(decimal)
  if (!decimal || Number.isNaN(n) || n <= 0) return { h: '', m: '' }
  const h = Math.floor(n)
  const m = Math.round((n - h) * 60)
  return { h: h ? String(h) : '', m: m ? String(m) : '' }
}

function juntar(h: string, m: string): number {
  return (Number(h) || 0) + (Number(m) || 0) / 60
}

export default function CampoDuracao({
  valor,
  onMudar,
  destaque,
  titulo,
}: {
  /** Horas decimais, como texto. Vazio = nada informado. */
  valor: string
  onMudar: (horasDecimais: string) => void
  /** Borda âmbar, usada na correção do administrador. */
  destaque?: boolean
  titulo?: string
}) {
  const inicial = partir(valor)
  const [h, setH] = useState(inicial.h)
  const [m, setM] = useState(inicial.m)
  // Guarda o que este campo mandou para fora, para distinguir uma mudança
  // nossa de uma mudança vinda dos atalhos (1h, meio dia, dia todo).
  const ultimoEnviado = useRef(valor)

  useEffect(() => {
    if (valor === ultimoEnviado.current) return
    const p = partir(valor)
    setH(p.h)
    setM(p.m)
    ultimoEnviado.current = valor
  }, [valor])

  function mudar(novoH: string, novoM: string) {
    setH(novoH)
    setM(novoM)
    const total = juntar(novoH, novoM)
    // Arredonda no centésimo de hora: é a precisão que o custo usa e evita
    // dízima em 20 minutos (0,333...).
    const texto = total > 0 ? String(Number(total.toFixed(2))) : ''
    ultimoEnviado.current = texto
    onMudar(texto)
  }

  /** 90 minutos digitados viram 1h30 ao sair do campo, em vez de erro. */
  function arrumarMinutos() {
    const minutos = Number(m) || 0
    if (minutos < 60) return
    const extra = Math.floor(minutos / 60)
    mudar(String((Number(h) || 0) + extra), String(minutos % 60 || ''))
  }

  const borda = destaque ? 'border-amber-400' : 'border-slate-300'

  return (
    <span className="inline-flex items-center gap-1" title={titulo}>
      <input
        type="number"
        min="0"
        max="24"
        step="1"
        value={h}
        onChange={(e) => mudar(e.target.value, m)}
        placeholder="0"
        className={`w-12 border ${borda} rounded-md px-1.5 py-1 text-xs text-right`}
        aria-label="horas"
      />
      <span className="text-[10px] text-slate-400">h</span>
      <input
        type="number"
        min="0"
        max="59"
        step="5"
        value={m}
        onChange={(e) => mudar(h, e.target.value)}
        onBlur={arrumarMinutos}
        placeholder="00"
        className={`w-12 border ${borda} rounded-md px-1.5 py-1 text-xs text-right`}
        aria-label="minutos"
      />
      <span className="text-[10px] text-slate-400">min</span>
    </span>
  )
}
