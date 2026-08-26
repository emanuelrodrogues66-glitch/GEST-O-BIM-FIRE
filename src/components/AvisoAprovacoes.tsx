import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { comemorarConclusao } from '../lib/celebracao'
import { normalizeStatus } from '../types'

type ProjetoAprovado = {
  nome: string
  numero: number | null
  pts: number
  aprovacao: string
}

type Comemoracao = {
  responsavel: string
  projetos: ProjetoAprovado[]
  pontos: number
}

/** Uma comemoração por abertura do sistema — não vira enfeite repetido. */
const CHAVE_SESSAO = 'bimfire:aviso-aprovacoes:visto'

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Segunda-feira da semana corrente. Domingo conta como fim da semana que passou. */
function inicioDaSemana(): string {
  const d = new Date()
  const dia = d.getDay() // 0 = domingo
  const recuo = dia === 0 ? 6 : dia - 1
  d.setDate(d.getDate() - recuo)
  return iso(d)
}

function fimDaSemana(): string {
  const d = new Date(`${inicioDaSemana()}T00:00:00`)
  d.setDate(d.getDate() + 6)
  return iso(d)
}

function formatarData(d: string): string {
  const [a, m, dia] = d.split('-')
  return `${dia}/${m}/${a}`
}

function formatarPts(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',')
}

/**
 * Comemoração de abertura: quem teve projeto aprovado nesta semana ganha um
 * "parabéns" com confete antes de qualquer cobrança.
 *
 * Como o escritório usa um login só, não dá para saber quem está na frente da
 * tela — então cada pessoa com aprovação aparece na sua vez, uma por vez.
 *
 * `onFim` avisa o App que pode abrir o aviso de tarefas atrasadas: elogio
 * primeiro, cobrança depois.
 */
export default function AvisoAprovacoes({ onFim }: { onFim: () => void }) {
  const [fila, setFila] = useState<Comemoracao[]>([])
  const [indice, setIndice] = useState(0)
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cada pessoa que entra em cena ganha o confete: duas rajadas e some.
  useEffect(() => {
    if (aberto && fila.length > 0) comemorarConclusao(2)
  }, [aberto, indice, fila.length])

  async function carregar() {
    if (sessionStorage.getItem(CHAVE_SESSAO)) {
      onFim()
      return
    }

    const inicio = inicioDaSemana()
    const fim = fimDaSemana()

    // A aprovação mora nos dados do cliente; o projeto guarda pontos e status.
    const { data: clientes } = await supabase
      .from('project_clients')
      .select('project_id, data_aprovacao')
      .gte('data_aprovacao', inicio)
      .lte('data_aprovacao', fim)

    const aprovacoes = new Map<string, string>()
    ;((clientes as { project_id: string; data_aprovacao: string | null }[]) || []).forEach((c) => {
      if (c.data_aprovacao) aprovacoes.set(c.project_id, c.data_aprovacao)
    })

    if (aprovacoes.size === 0) {
      sessionStorage.setItem(CHAVE_SESSAO, '1')
      onFim()
      return
    }

    const { data: projetos } = await supabase
      .from('projects')
      .select('id, nome, numero, pts, status, responsavel')
      .in('id', Array.from(aprovacoes.keys()))

    const mapa = new Map<string, Comemoracao>()
    for (const p of ((projetos as any[]) || [])) {
      // Só conta o que de fato fechou: aprovação sem conclusão ainda é promessa.
      if (normalizeStatus(p.status) !== 'Concluído') continue
      const nome = (p.responsavel || '').trim()
      if (!nome) continue

      if (!mapa.has(nome)) mapa.set(nome, { responsavel: nome, projetos: [], pontos: 0 })
      const linha = mapa.get(nome)!
      linha.projetos.push({
        nome: p.nome,
        numero: p.numero,
        pts: p.pts || 0,
        aprovacao: aprovacoes.get(p.id)!,
      })
      linha.pontos += p.pts || 0
    }

    for (const linha of mapa.values()) {
      linha.projetos.sort((a, b) => a.aprovacao.localeCompare(b.aprovacao))
    }

    // Quem fez mais pontos abre a fila.
    const lista = Array.from(mapa.values()).sort(
      (a, b) => b.pontos - a.pontos || b.projetos.length - a.projetos.length
    )

    sessionStorage.setItem(CHAVE_SESSAO, '1')

    if (lista.length === 0) {
      onFim()
      return
    }

    setFila(lista)
    setAberto(true)
  }

  function avancar() {
    if (indice + 1 < fila.length) {
      setIndice(indice + 1)
      return
    }
    setAberto(false)
    onFim()
  }

  function pularTodos() {
    setAberto(false)
    onFim()
  }

  if (!aberto || fila.length === 0) return null

  const atual = fila[indice]
  const quantos = atual.projetos.length
  const ultimo = indice + 1 === fila.length

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[55] p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 px-6 py-6 text-center">
          <div className="text-4xl mb-2">🎉</div>
          <h2 className="text-xl font-bold text-white">Parabéns, {atual.responsavel}!</h2>
          <p className="text-sm text-emerald-50 mt-1">
            Você aprovou <b>{quantos}</b> {quantos === 1 ? 'projeto' : 'projetos'} esta semana
            {atual.pontos > 0 && <> — <b>{formatarPts(atual.pontos)}</b> {atual.pontos === 1 ? 'ponto' : 'pontos'}</>}.
            Continue assim!
          </p>
        </div>

        <div className="px-5 py-4 max-h-[45vh] overflow-y-auto">
          <ul className="space-y-1.5">
            {atual.projetos.map((p, i) => (
              <li
                key={i}
                className="flex items-center gap-2 text-xs text-slate-700 border-b border-slate-100 pb-1.5 last:border-0"
              >
                <span className="text-emerald-600">✓</span>
                <span className="text-slate-400 tabular-nums">{formatarData(p.aprovacao).slice(0, 5)}</span>
                {p.numero !== null && (
                  <span className="text-slate-400 tabular-nums">#{p.numero}</span>
                )}
                <span className="flex-1 truncate font-medium">{p.nome}</span>
                {p.pts > 0 && (
                  <span className="text-emerald-700 font-semibold tabular-nums">{formatarPts(p.pts)} pts</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-400">
            {fila.length > 1 ? `${indice + 1} de ${fila.length}` : 'Semana de ' + formatarData(inicioDaSemana())}
          </span>
          <div className="flex items-center gap-2">
            {fila.length > 1 && !ultimo && (
              <button
                onClick={pularTodos}
                className="text-xs font-medium px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                Pular
              </button>
            )}
            <button
              onClick={avancar}
              className="text-xs font-semibold px-4 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {ultimo ? 'Valeu!' : 'Próximo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
