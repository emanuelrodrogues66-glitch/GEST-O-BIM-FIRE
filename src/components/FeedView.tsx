import { useEffect, useMemo, useState } from 'react'
import { supabase, carregarTabelaCompleta } from '../lib/supabase'
import { STATUS_TO_LETRA, faixaHoraria, statusColor } from '../types'

type Tipo = 'status' | 'atividade' | 'tarefa' | 'pendencia' | 'correcao' | 'arquivo'

type Evento = {
  id: string
  data: string
  hora?: string | null
  tipo: Tipo
  titulo: string
  detalhe?: string | null
  autor?: string | null
  projectId?: string | null
  projeto?: string | null
  cor: string
  icone: string
}

const TIPOS: { valor: Tipo; rotulo: string; icone: string }[] = [
  { valor: 'status', rotulo: 'Status', icone: '◆' },
  { valor: 'atividade', rotulo: 'Atividades', icone: '✎' },
  { valor: 'tarefa', rotulo: 'Tarefas', icone: '☑' },
  { valor: 'pendencia', rotulo: 'Pendências', icone: '⏸' },
  { valor: 'correcao', rotulo: 'Correções', icone: '⚠' },
  { valor: 'arquivo', rotulo: 'Arquivos', icone: '📎' },
]

const PERIODOS = [
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
  { dias: 0, rotulo: 'Tudo' },
]

const LETRA_PARA_STATUS: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_TO_LETRA).map(([status, letra]) => [letra, status])
)

function hojeStr() {
  return new Date().toISOString().slice(0, 10)
}

function diasAtras(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function formatarData(d: string | null | undefined): string {
  if (!d) return '—'
  const [a, m, dia] = d.slice(0, 10).split('-')
  return `${dia}/${m}/${a}`
}

/** "hoje", "ontem" ou a data por extenso curta. */
function rotuloDoDia(d: string): string {
  if (d === hojeStr()) return 'Hoje'
  if (d === diasAtras(1)) return 'Ontem'
  return formatarData(d)
}

/**
 * Feed geral: tudo que aconteceu no escritório, de todos os projetos e das
 * tarefas gerais, numa linha do tempo só.
 */
export default function FeedView({
  onProjectClick,
  responsavelFiltro: filtroDoTopo,
}: {
  onProjectClick?: (projectId: string) => void
  /** Filtro único de responsável, vindo do topo do app. */
  responsavelFiltro?: string
}) {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [periodo, setPeriodo] = useState(30)
  const [filtros, setFiltros] = useState<Set<Tipo>>(new Set())
  const responsavelFiltro = filtroDoTopo || ''
  const [busca, setBusca] = useState('')

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo])

  async function carregar() {
    setCarregando(true)
    // "Tudo" ainda precisa de um corte, senão a tela vira um dump do banco.
    const desde = periodo === 0 ? '2000-01-01' : diasAtras(periodo)
    // Um dia a mais para trás: é dele que sai a comparação da primeira virada.
    const desdeComFolga = periodo === 0 ? desde : diasAtras(periodo + 1)

    const [projetosRes, atividades, tarefas, pendencias, correcoes, arquivos] = await Promise.all([
      supabase.from('projects').select('id, nome, numero'),
      supabase.from('project_activities').select('*').gte('data', desde),
      supabase
        .from('project_tasks')
        .select('*, projects(nome, numero)')
        .or(`created_at.gte.${desde},data_conclusao.gte.${desde}`),
      supabase.from('project_pendencies').select('*').gte('data_inicio', desde),
      supabase.from('project_corrections').select('*').gte('data', desde),
      supabase.from('project_files').select('*').gte('created_at', desde),
    ])

    const projetos = new Map<string, { nome: string; numero: number | null }>()
    ;((projetosRes.data as any[]) || []).forEach((p) => projetos.set(p.id, { nome: p.nome, numero: p.numero }))

    const nomeProjeto = (id: string | null | undefined) => {
      if (!id) return null
      const p = projetos.get(id)
      if (!p) return null
      return p.numero ? `${p.numero} · ${p.nome}` : p.nome
    }

    // Progresso diário é a maior tabela; lê em páginas e só a janela pedida.
    const progresso = await carregarProgresso(desdeComFolga)

    const lista: Evento[] = []

    // Viradas de status, por projeto.
    const porProjeto = new Map<string, { data: string; letra: string }[]>()
    for (const d of progresso) {
      if (!porProjeto.has(d.project_id)) porProjeto.set(d.project_id, [])
      porProjeto.get(d.project_id)!.push(d)
    }
    for (const [pid, dias] of porProjeto) {
      dias.sort((a, b) => a.data.localeCompare(b.data))
      let anterior: string | null = null
      for (const d of dias) {
        const status =
          LETRA_PARA_STATUS[d.letra.toUpperCase()] || (d.letra.toUpperCase() === 'S' ? 'Início' : null)
        if (!status) continue
        if (status !== anterior && anterior !== null && d.data >= desde) {
          lista.push({
            id: `st-${pid}-${d.data}`,
            data: d.data,
            tipo: 'status',
            titulo: `${anterior} → ${status}`,
            projectId: pid,
            projeto: nomeProjeto(pid),
            cor: statusColor(status).hex,
            icone: '◆',
          })
        }
        anterior = status
      }
    }

    for (const a of (atividades.data as any[]) || []) {
      lista.push({
        id: `at-${a.id}`,
        data: a.data,
        tipo: 'atividade',
        titulo: 'Trabalhou no projeto',
        detalhe: a.descricao,
        autor: a.responsavel,
        projectId: a.project_id,
        projeto: nomeProjeto(a.project_id),
        cor: '#6366f1',
        icone: '✎',
      })
    }

    for (const t of (tarefas.data as any[]) || []) {
      const nomeProj = t.project_id ? nomeProjeto(t.project_id) : 'Tarefa geral'
      const horario = faixaHoraria(t.hora_inicio, t.hora_fim)

      // Ocorrência de rotina não é ação de ninguém: o sistema gerou.
      // Sem isso o feed viraria uma lista de "criou café", "criou café"...
      const geradaPorRegra = !!t.recurrence_id

      if (!geradaPorRegra && t.created_at.slice(0, 10) >= desde) {
        lista.push({
          id: `tk-${t.id}`,
          data: t.created_at.slice(0, 10),
          hora: t.created_at.slice(11, 16),
          tipo: 'tarefa',
          titulo: `Criou a tarefa "${t.nome}"`,
          detalhe: `Prazo ${formatarData(t.data_prazo)}${horario ? ` · ${horario}` : ''}`,
          autor: t.responsavel,
          projectId: t.project_id,
          projeto: nomeProj,
          cor: '#0ea5e9',
          icone: '☑',
        })
      }

      if (t.status === 'Concluído' && t.data_conclusao && t.data_conclusao >= desde) {
        const atrasada = t.data_conclusao > t.data_prazo
        lista.push({
          id: `tk-fim-${t.id}`,
          data: t.data_conclusao,
          tipo: 'tarefa',
          titulo: `Concluiu "${t.nome}"`,
          detalhe: atrasada ? `Fora do prazo (era ${formatarData(t.data_prazo)})` : 'No prazo',
          autor: t.responsavel,
          projectId: t.project_id,
          projeto: nomeProj,
          cor: atrasada ? '#f59e0b' : '#10b981',
          icone: '✓',
        })
      }
    }

    for (const p of (pendencias.data as any[]) || []) {
      lista.push({
        id: `pd-${p.id}`,
        data: p.data_inicio,
        tipo: 'pendencia',
        titulo: `Entrou em pendência${p.motivo ? `: ${p.motivo}` : ''}`,
        detalhe: p.justificativa,
        autor: p.responsavel,
        projectId: p.project_id,
        projeto: nomeProjeto(p.project_id),
        cor: '#38bdf8',
        icone: '⏸',
      })
      if (p.data_fim && p.data_fim >= desde) {
        lista.push({
          id: `pd-fim-${p.id}`,
          data: p.data_fim,
          tipo: 'pendencia',
          titulo: 'Saiu da pendência',
          detalhe: p.observacao_encerramento,
          projectId: p.project_id,
          projeto: nomeProjeto(p.project_id),
          cor: '#22c55e',
          icone: '▶',
        })
      }
    }

    for (const c of (correcoes.data as any[]) || []) {
      lista.push({
        id: `cr-${c.id}`,
        data: c.data,
        tipo: 'correcao',
        titulo: `Recebeu correção ${c.numero ?? ''}`.trim(),
        detalhe: c.observacoes,
        autor: c.analista,
        projectId: c.project_id,
        projeto: nomeProjeto(c.project_id),
        cor: '#ef4444',
        icone: '⚠',
      })
      if (c.data_resposta && c.data_resposta >= desde) {
        lista.push({
          id: `cr-r-${c.id}`,
          data: c.data_resposta,
          tipo: 'correcao',
          titulo: `Respondeu a correção ${c.numero ?? ''}`.trim(),
          projectId: c.project_id,
          projeto: nomeProjeto(c.project_id),
          cor: '#22c55e',
          icone: '↩',
        })
      }
    }

    for (const f of (arquivos.data as any[]) || []) {
      lista.push({
        id: `ar-${f.id}`,
        data: f.created_at.slice(0, 10),
        hora: f.created_at.slice(11, 16),
        tipo: 'arquivo',
        titulo: `Enviou "${f.nome}"`,
        detalhe: f.categoria,
        autor: f.enviado_por,
        projectId: f.project_id,
        projeto: nomeProjeto(f.project_id),
        cor: '#a855f7',
        icone: '📎',
      })
    }

    lista.sort((a, b) => {
      if (a.data !== b.data) return b.data.localeCompare(a.data)
      return (b.hora || '').localeCompare(a.hora || '')
    })

    setEventos(lista)
    setCarregando(false)
  }

  /** Progresso diário da janela pedida, em páginas de 1.000. */
  async function carregarProgresso(desde: string) {
    if (periodo === 0) {
      return carregarTabelaCompleta<{ project_id: string; data: string; letra: string }>(
        'daily_progress',
        'project_id, data, letra',
        'data'
      )
    }
    const { data } = await supabase
      .from('daily_progress')
      .select('project_id, data, letra')
      .gte('data', desde)
      .order('data', { ascending: true })
      .limit(5000)
    return (data as { project_id: string; data: string; letra: string }[]) || []
  }

  const visiveis = useMemo(
    () =>
      eventos.filter((e) => {
        if (filtros.size > 0 && !filtros.has(e.tipo)) return false
        if (responsavelFiltro && (e.autor || '').trim() !== responsavelFiltro) return false
        if (busca) {
          const alvo = `${e.titulo} ${e.detalhe || ''} ${e.projeto || ''} ${e.autor || ''}`.toLowerCase()
          if (!alvo.includes(busca.toLowerCase())) return false
        }
        return true
      }),
    [eventos, filtros, responsavelFiltro, busca]
  )

  const porDia = useMemo(() => {
    const mapa = new Map<string, Evento[]>()
    for (const e of visiveis) {
      if (!mapa.has(e.data)) mapa.set(e.data, [])
      mapa.get(e.data)!.push(e)
    }
    return Array.from(mapa.entries())
  }, [visiveis])

  function alternarFiltro(t: Tipo) {
    setFiltros((prev) => {
      const novo = new Set(prev)
      if (novo.has(t)) novo.delete(t)
      else novo.add(t)
      return novo
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              onClick={() => setPeriodo(p.dias)}
              className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
                periodo === p.dias ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {p.rotulo}
            </button>
          ))}
        </div>

        <input
          placeholder="Buscar no feed..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white flex-1 min-w-[160px] max-w-xs"
        />

        <button
          onClick={carregar}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
        >
          Atualizar
        </button>

        <span className="text-xs text-slate-400 ml-auto">{visiveis.length} evento(s)</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TIPOS.map((t) => {
          const ativo = filtros.has(t.valor)
          const quantos = eventos.filter((e) => e.tipo === t.valor).length
          return (
            <button
              key={t.valor}
              onClick={() => alternarFiltro(t.valor)}
              disabled={quantos === 0}
              className={`text-[11px] font-medium px-2 py-1 rounded-md border transition disabled:opacity-40 ${
                ativo
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {t.icone} {t.rotulo} <span className="opacity-60">{quantos}</span>
            </button>
          )
        })}
        {filtros.size > 0 && (
          <button onClick={() => setFiltros(new Set())} className="text-[11px] text-indigo-600 hover:underline">
            limpar
          </button>
        )}
      </div>

      {carregando ? (
        <p className="text-sm text-slate-400 text-center py-10">Montando o feed...</p>
      ) : porDia.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10 bg-white border border-slate-200 rounded-xl">
          Nada aconteceu no período escolhido.
        </p>
      ) : (
        <div className="space-y-4">
          {porDia.map(([dia, items]) => (
            <div key={dia} className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-700 mb-3">
                {rotuloDoDia(dia)}
                <span className="font-normal text-slate-400"> · {items.length} evento(s)</span>
              </p>
              <div className="space-y-1.5 border-l-2 border-slate-100 pl-3 ml-1">
                {items.map((e) => (
                  <div key={e.id} className="relative">
                    <span
                      className="absolute -left-[19px] top-2 w-2.5 h-2.5 rounded-full ring-2 ring-white"
                      style={{ background: e.cor }}
                    />
                    <div className="border border-slate-200 rounded-lg px-2.5 py-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span style={{ color: e.cor }}>{e.icone}</span>
                        {e.autor && <span className="font-semibold text-slate-800">{e.autor}</span>}
                        <span className="text-slate-700">{e.titulo}</span>
                        {e.projeto &&
                          (e.projectId ? (
                            <button
                              onClick={() => onProjectClick?.(e.projectId!)}
                              className="text-slate-500 hover:text-indigo-700 hover:underline"
                            >
                              · {e.projeto}
                            </button>
                          ) : (
                            <span className="text-slate-400">· {e.projeto}</span>
                          ))}
                        {e.hora && <span className="text-slate-400 tabular-nums ml-auto">{e.hora}</span>}
                      </div>
                      {e.detalhe && (
                        <p className="text-[11px] text-slate-500 mt-0.5 whitespace-pre-wrap">{e.detalhe}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
