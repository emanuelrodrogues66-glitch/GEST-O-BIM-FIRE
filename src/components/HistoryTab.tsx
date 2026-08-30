import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { STATUS_TO_LETRA, statusColor } from '../types'
import { dataLocal, horaLocal } from '../lib/datas'

/** Um acontecimento na vida do projeto, venha de onde vier. */
type Evento = {
  id: string
  data: string
  hora?: string | null
  tipo: Tipo
  titulo: string
  detalhe?: string | null
  autor?: string | null
  cor: string
  icone: string
}

type Tipo = 'status' | 'atividade' | 'tarefa' | 'pendencia' | 'correcao' | 'arquivo' | 'projeto'

const TIPOS: { valor: Tipo; rotulo: string; icone: string }[] = [
  { valor: 'status', rotulo: 'Status', icone: '◆' },
  { valor: 'atividade', rotulo: 'Atividades', icone: '✎' },
  { valor: 'tarefa', rotulo: 'Tarefas', icone: '☑' },
  { valor: 'pendencia', rotulo: 'Pendências', icone: '⏸' },
  { valor: 'correcao', rotulo: 'Correções', icone: '⚠' },
  { valor: 'arquivo', rotulo: 'Arquivos', icone: '📎' },
]

/** Letra do progresso diário -> nome do status. */
const LETRA_PARA_STATUS: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_TO_LETRA).map(([status, letra]) => [letra, status])
)

function formatarData(d: string | null | undefined): string {
  if (!d) return '—'
  const [a, m, dia] = d.slice(0, 10).split('-')
  return `${dia}/${m}/${a}`
}

// O carimbo vem em UTC; sem converter, a hora aparece 3h à frente.
const soData = dataLocal
const soHora = horaLocal

/**
 * Linha do tempo do projeto: junta num lugar só tudo que aconteceu —
 * mudanças de status, atividades, tarefas, pendências, correções e anexos.
 */
export default function HistoryTab({ projectId }: { projectId: string }) {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtros, setFiltros] = useState<Set<Tipo>>(new Set())

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function carregar() {
    setCarregando(true)

    const [projeto, progresso, atividades, tarefas, pendencias, correcoes, arquivos] = await Promise.all([
      supabase.from('projects').select('nome, data_inicio, created_at').eq('id', projectId).maybeSingle(),
      supabase
        .from('daily_progress')
        .select('data, letra')
        .eq('project_id', projectId)
        .order('data', { ascending: true }),
      supabase.from('project_activities').select('*').eq('project_id', projectId),
      supabase.from('project_tasks').select('*').eq('project_id', projectId),
      supabase.from('project_pendencies').select('*').eq('project_id', projectId),
      supabase.from('project_corrections').select('*').eq('project_id', projectId),
      supabase.from('project_files').select('*').eq('project_id', projectId),
    ])

    const lista: Evento[] = []

    // Início do projeto
    if (projeto.data) {
      const p = projeto.data as { nome: string; data_inicio: string; created_at: string }
      lista.push({
        id: 'inicio',
        data: p.data_inicio || soData(p.created_at),
        tipo: 'projeto',
        titulo: 'Projeto iniciado',
        detalhe: p.nome,
        cor: '#64748b',
        icone: '▶',
      })
    }

    // Mudanças de status, deduzidas das viradas de letra no progresso diário.
    const dias = (progresso.data as { data: string; letra: string }[] | null) || []
    let anterior: string | null = null
    for (const d of dias) {
      const status = LETRA_PARA_STATUS[d.letra.toUpperCase()] || (d.letra.toUpperCase() === 'S' ? 'Início' : null)
      if (!status || status === anterior) continue
      lista.push({
        id: `status-${d.data}`,
        data: d.data,
        tipo: 'status',
        titulo: anterior ? `Status: ${anterior} → ${status}` : `Status: ${status}`,
        cor: status === 'Início' ? '#15803d' : statusColor(status).hex,
        icone: '◆',
      })
      anterior = status
    }

    for (const a of (atividades.data as any[]) || []) {
      lista.push({
        id: `ativ-${a.id}`,
        data: a.data,
        tipo: 'atividade',
        titulo: 'Atividade registrada',
        detalhe: a.descricao,
        autor: a.responsavel,
        cor: '#6366f1',
        icone: '✎',
      })
    }

    for (const t of (tarefas.data as any[]) || []) {
      lista.push({
        id: `tarefa-${t.id}`,
        data: soData(t.created_at),
        hora: soHora(t.created_at),
        tipo: 'tarefa',
        titulo: `Tarefa criada: ${t.nome}`,
        detalhe: `Prazo ${formatarData(t.data_prazo)}`,
        autor: t.responsavel,
        cor: '#0ea5e9',
        icone: '☑',
      })
      if (t.status === 'Concluído' && t.data_conclusao) {
        const atrasada = t.data_conclusao > t.data_prazo
        lista.push({
          id: `tarefa-fim-${t.id}`,
          data: t.data_conclusao,
          tipo: 'tarefa',
          titulo: `Tarefa concluída: ${t.nome}`,
          detalhe: atrasada ? `Fora do prazo (era ${formatarData(t.data_prazo)})` : 'No prazo',
          autor: t.responsavel,
          cor: atrasada ? '#f59e0b' : '#10b981',
          icone: '✓',
        })
      }
    }

    for (const p of (pendencias.data as any[]) || []) {
      lista.push({
        id: `pend-${p.id}`,
        data: p.data_inicio,
        tipo: 'pendencia',
        titulo: `Entrou em pendência${p.motivo ? `: ${p.motivo}` : ''}`,
        detalhe: p.justificativa,
        autor: p.responsavel,
        cor: '#38bdf8',
        icone: '⏸',
      })
      if (p.data_fim) {
        lista.push({
          id: `pend-fim-${p.id}`,
          data: p.data_fim,
          tipo: 'pendencia',
          titulo: 'Pendência encerrada',
          detalhe: p.observacao_encerramento,
          cor: '#22c55e',
          icone: '▶',
        })
      }
    }

    for (const c of (correcoes.data as any[]) || []) {
      lista.push({
        id: `corr-${c.id}`,
        data: c.data,
        tipo: 'correcao',
        titulo: `Correção ${c.numero ?? ''} recebida`.trim(),
        detalhe: c.observacoes,
        autor: c.analista,
        cor: '#ef4444',
        icone: '⚠',
      })
      if (c.data_resposta) {
        lista.push({
          id: `corr-resp-${c.id}`,
          data: c.data_resposta,
          tipo: 'correcao',
          titulo: `Correção ${c.numero ?? ''} respondida`.trim(),
          cor: '#22c55e',
          icone: '↩',
        })
      }
    }

    for (const f of (arquivos.data as any[]) || []) {
      lista.push({
        id: `arq-${f.id}`,
        data: soData(f.created_at),
        hora: soHora(f.created_at),
        tipo: 'arquivo',
        titulo: `Anexo enviado: ${f.nome}`,
        detalhe: f.categoria,
        autor: f.enviado_por,
        cor: '#a855f7',
        icone: '📎',
      })
    }

    // Mais recente primeiro; dentro do mesmo dia, quem tem hora vem antes.
    lista.sort((a, b) => {
      if (a.data !== b.data) return b.data.localeCompare(a.data)
      return (b.hora || '').localeCompare(a.hora || '')
    })

    setEventos(lista)
    setCarregando(false)
  }

  const visiveis = useMemo(
    () => (filtros.size === 0 ? eventos : eventos.filter((e) => filtros.has(e.tipo))),
    [eventos, filtros]
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

  if (carregando) {
    return <p className="text-sm text-slate-400 text-center py-10">Montando a linha do tempo...</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Filtrar:</span>
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
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {t.icone} {t.rotulo} <span className="opacity-60">{quantos}</span>
            </button>
          )
        })}
        {filtros.size > 0 && (
          <button
            onClick={() => setFiltros(new Set())}
            className="text-[11px] text-indigo-600 hover:underline"
          >
            limpar
          </button>
        )}
        <span className="text-xs text-slate-400 ml-auto">{visiveis.length} evento(s)</span>
      </div>

      {porDia.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10 border border-slate-200 rounded-xl">
          Nada registrado ainda neste projeto.
        </p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto pr-1 space-y-3">
          {porDia.map(([dia, items]) => (
            <div key={dia}>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5 sticky top-0 bg-white py-0.5">
                {formatarData(dia)}
              </p>
              <div className="space-y-1.5 border-l-2 border-slate-100 pl-3 ml-1">
                {items.map((e) => (
                  <div key={e.id} className="relative">
                    {/* Bolinha na linha do tempo */}
                    <span
                      className="absolute -left-[19px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-white"
                      style={{ background: e.cor }}
                    />
                    <div className="border border-slate-200 rounded-lg px-2.5 py-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span style={{ color: e.cor }}>{e.icone}</span>
                        <span className="font-medium text-slate-800">{e.titulo}</span>
                        {e.autor && <span className="text-slate-500">· {e.autor}</span>}
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
