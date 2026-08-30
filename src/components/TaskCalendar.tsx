import { useMemo, useState } from 'react'
import type { TarefaDaAgenda } from '../lib/agenda'
import { corDoResponsavel, hojeStr, inicioDaSemana, paraData, paraIso, somarDias } from '../lib/agenda'
import { faixaHoraria, horaCurta, isTaskLate } from '../types'
import type { ReuniaoDaAgenda } from '../lib/reunioes'
import type { VencimentoProximo } from '../lib/renovacoes'
import { descreverVencimento } from '../lib/renovacoes'

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const CABECALHO_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

type Visao = 'mes' | 'semana' | 'dia'

/**
 * Faixa de horas da visão Dia: só o expediente.
 * Fora dele quase não há tarefa, e cortar sobra espaço para o texto caber.
 */
const HORA_INICIAL = 8
const HORA_FINAL = 18
const ALTURA_HORA = 64 // px

/** "09:30:00" -> 9.5 */
function emHoras(h: string | null): number | null {
  if (!h) return null
  const [hh, mm] = h.split(':').map(Number)
  return hh + (mm || 0) / 60
}

export default function TaskCalendar({
  tarefas,
  reunioes = [],
  vencimentos = [],
  onTarefaClick,
  onProjetoClick,
  onNovoHorario,
  onConcluir,
}: {
  tarefas: TarefaDaAgenda[]
  /** Compromissos marcados no cartão do projeto, no mesmo calendário. */
  reunioes?: ReuniaoDaAgenda[]
  /** Vistorias e laudos que vencem — renovar é trabalho com data marcada. */
  vencimentos?: VencimentoProximo[]
  onProjetoClick?: (projectId: string) => void
  onTarefaClick?: (t: TarefaDaAgenda) => void
  /** Clique num espaço vazio da grade de horas: cria tarefa naquele horário. */
  onNovoHorario?: (dados: { data: string; hora: string; responsavel: string }) => void
  /** Marca/desmarca a tarefa como concluída sem sair do calendário. */
  onConcluir?: (t: TarefaDaAgenda, concluir: boolean) => void
}) {
  const [visao, setVisao] = useState<Visao>('mes')
  // Reunião aberta no calendário: mostra ata e encaminhamentos sem sair daqui.
  const [reuniaoAberta, setReuniaoAberta] = useState<ReuniaoDaAgenda | null>(null)

  /** Reuniões do dia, na ordem do relógio. */
  const reunioesPorDia = useMemo(() => {
    const mapa = new Map<string, ReuniaoDaAgenda[]>()
    for (const r of reunioes) {
      if (!mapa.has(r.data)) mapa.set(r.data, [])
      mapa.get(r.data)!.push(r)
    }
    for (const lista of mapa.values()) {
      lista.sort((a, b) => (a.hora_inicio || '99').localeCompare(b.hora_inicio || '99'))
    }
    return mapa
  }, [reunioes])

  /** Vencimentos agrupados pelo dia em que expiram. */
  const vencimentosPorDia = useMemo(() => {
    const mapa = new Map<string, VencimentoProximo[]>()
    for (const v of vencimentos) {
      const dia = v.projeto.data_vencimento
      if (!dia) continue
      if (!mapa.has(dia)) mapa.set(dia, [])
      mapa.get(dia)!.push(v)
    }
    return mapa
  }, [vencimentos])
  // A grade de horas fica apertada dentro da página; abre em janela cheia,
  // como o cartão do projeto.
  const [diaAmpliado, setDiaAmpliado] = useState(false)
  const [ancora, setAncora] = useState<Date>(() => paraData(hojeStr()))
  // O filtro de responsável é único e fica no topo do app; aqui só se lê
  // o que já veio filtrado.
  const responsavelFiltro = ''

  const responsaveis = useMemo(() => {
    const nomes = new Set<string>()
    tarefas.forEach((t) => nomes.add((t.responsavel || 'Sem responsável').trim()))
    return Array.from(nomes).sort((a, b) => a.localeCompare(b))
  }, [tarefas])

  const visiveis = useMemo(
    () =>
      responsavelFiltro
        ? tarefas.filter((t) => (t.responsavel || 'Sem responsável').trim() === responsavelFiltro)
        : tarefas,
    [tarefas, responsavelFiltro]
  )

  /** Tarefas agrupadas pelo dia do prazo. */
  const porDia = useMemo(() => {
    const mapa = new Map<string, TarefaDaAgenda[]>()
    for (const t of visiveis) {
      if (!t.data_prazo) continue
      if (!mapa.has(t.data_prazo)) mapa.set(t.data_prazo, [])
      mapa.get(t.data_prazo)!.push(t)
    }
    // Com hora marcada vem primeiro, na ordem do relógio.
    for (const lista of mapa.values()) {
      lista.sort((a, b) => (a.hora_inicio || '99').localeCompare(b.hora_inicio || '99'))
    }
    return mapa
  }, [visiveis])

  function navegar(delta: number) {
    setAncora((a) => {
      if (visao === 'mes') return new Date(a.getFullYear(), a.getMonth() + delta, 1)
      if (visao === 'dia') return somarDias(a, delta)
      return somarDias(a, delta * 7)
    })
  }

  const titulo =
    visao === 'mes'
      ? `${NOMES_MES[ancora.getMonth()]} ${ancora.getFullYear()}`
      : visao === 'dia'
        ? `${CABECALHO_SEMANA[ancora.getDay()]}, ${ancora.getDate()} de ${NOMES_MES[ancora.getMonth()].toLowerCase()}`
        : (() => {
          const ini = inicioDaSemana(ancora)
          const fim = somarDias(ini, 6)
          return `${ini.getDate()}/${ini.getMonth() + 1} a ${fim.getDate()}/${fim.getMonth() + 1}`
          })()

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-1 py-1">
          <button
            onClick={() => navegar(-1)}
            className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded-md"
          >
            ‹
          </button>
          <span className="text-xs font-semibold text-slate-700 px-2 min-w-[130px] text-center">{titulo}</span>
          <button
            onClick={() => navegar(1)}
            className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded-md"
          >
            ›
          </button>
        </div>

        <button
          onClick={() => setAncora(paraData(hojeStr()))}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
        >
          Hoje
        </button>

        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {(
            [
              ['mes', 'Mês'],
              ['semana', 'Semana'],
              ['dia', 'Dia'],
            ] as [Visao, string][]
          ).map(([v, rotulo]) => (
            <button
              key={v}
              onClick={() => {
                setVisao(v)
                setDiaAmpliado(v === 'dia')
              }}
              className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
                visao === v ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {responsaveis.slice(0, 8).map((r) => (
            <span key={r} className="flex items-center gap-1 text-[10px] text-slate-500">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: corDoResponsavel(r) }} />
              {r}
            </span>
          ))}
        </div>
      </div>

      {visao === 'mes' && (
        <VisaoMes
          ancora={ancora}
          porDia={porDia}
          reunioesPorDia={reunioesPorDia}
          vencimentosPorDia={vencimentosPorDia}
          onProjetoClick={onProjetoClick}
          onReuniaoClick={setReuniaoAberta}
          onTarefaClick={onTarefaClick}
          onConcluir={onConcluir}
        />
      )}

      {reuniaoAberta && (
        <DetalheDaReuniao reuniao={reuniaoAberta} onFechar={() => setReuniaoAberta(null)} />
      )}

      {visao === 'semana' && (
        <VisaoSemana
          ancora={ancora}
          porDia={porDia}
          responsaveis={responsavelFiltro ? [responsavelFiltro] : responsaveis}
          onTarefaClick={onTarefaClick}
          onConcluir={onConcluir}
        />
      )}

      {visao === 'dia' && !diaAmpliado && (
        <button
          onClick={() => setDiaAmpliado(true)}
          className="w-full border border-dashed border-slate-300 rounded-xl py-6 text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition"
        >
          Abrir a agenda de {titulo} em tela cheia
        </button>
      )}

      {visao === 'dia' && diaAmpliado && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4">
          <div className="w-full max-w-6xl h-[92vh] bg-white rounded-2xl shadow-lg border border-slate-200 flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center gap-3">
              <h3 className="text-sm font-semibold text-slate-800 capitalize">{titulo}</h3>

              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-1 py-1">
                <button
                  onClick={() => navegar(-1)}
                  className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded-md"
                  title="Dia anterior"
                >
                  ‹
                </button>
                <button
                  onClick={() => setAncora(paraData(hojeStr()))}
                  className="text-xs font-medium px-2 text-slate-600 hover:text-slate-900"
                >
                  Hoje
                </button>
                <button
                  onClick={() => navegar(1)}
                  className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded-md"
                  title="Próximo dia"
                >
                  ›
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 ml-auto">
                {responsaveis.slice(0, 8).map((r) => (
                  <span key={r} className="flex items-center gap-1 text-[10px] text-slate-500">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: corDoResponsavel(r) }} />
                    {r}
                  </span>
                ))}
              </div>

              <button
                onClick={() => setDiaAmpliado(false)}
                className="text-slate-400 hover:text-slate-700 text-xl leading-none px-1"
                title="Fechar"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <VisaoDia
                ancora={ancora}
                porDia={porDia}
                responsaveis={responsavelFiltro ? [responsavelFiltro] : responsaveis}
                onTarefaClick={onTarefaClick}
                onNovoHorario={onNovoHorario}
                onConcluir={onConcluir}
                alturaCheia
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Caixinha de concluir: um clique marca, outro desmarca. */
function MarcadorConclusao({
  concluida,
  onToggle,
}: {
  concluida: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={(e) => {
        // Não pode abrir a tarefa junto com o clique de concluir.
        e.stopPropagation()
        onToggle()
      }}
      title={concluida ? 'Reabrir tarefa' : 'Marcar como concluída'}
      className={`shrink-0 w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[8px] leading-none transition ${
        concluida
          ? 'bg-emerald-500 border-emerald-500 text-white'
          : 'border-slate-300 text-transparent hover:border-emerald-500 hover:text-emerald-500'
      }`}
    >
      ✓
    </button>
  )
}

function Pilula({
  t,
  onClick,
  onConcluir,
  mostrarResponsavel = true,
}: {
  t: TarefaDaAgenda
  onClick?: () => void
  onConcluir?: (t: TarefaDaAgenda, concluir: boolean) => void
  mostrarResponsavel?: boolean
}) {
  const atrasada = isTaskLate(t)
  const concluida = t.status === 'Concluído'
  const cor = t.task_categories?.cor || corDoResponsavel(t.responsavel)

  return (
    <div
      onClick={onClick}
      title={`${t.nome}${t.responsavel ? ` · ${t.responsavel}` : ''}${
        t.projects ? ` · ${t.projects.nome}` : ' · tarefa geral'
      }${atrasada ? ' · ATRASADA' : ''}`}
      className={`w-full flex items-center gap-1 text-left text-[10px] px-1.5 py-0.5 rounded border-l-2 cursor-pointer transition hover:brightness-95 ${
        concluida ? 'text-slate-400 bg-slate-50' : 'text-slate-700 bg-slate-50'
      } ${atrasada && !concluida ? 'bg-red-50 text-red-700' : ''}`}
      style={{ borderLeftColor: atrasada && !concluida ? '#ef4444' : cor }}
    >
      {onConcluir && (
        <MarcadorConclusao concluida={concluida} onToggle={() => onConcluir(t, !concluida)} />
      )}
      <span className={`truncate ${concluida ? 'line-through' : ''}`}>
        {t.hora_inicio && <span className="font-semibold tabular-nums">{horaCurta(t.hora_inicio)} </span>}
        {mostrarResponsavel && t.responsavel && (
          <span className="font-semibold" style={{ color: corDoResponsavel(t.responsavel) }}>
            {t.responsavel.split(' ')[0]}{' '}
          </span>
        )}
        {t.nome}
      </span>
    </div>
  )
}

function VisaoMes({
  ancora,
  porDia,
  reunioesPorDia,
  vencimentosPorDia,
  onReuniaoClick,
  onProjetoClick,
  onTarefaClick,
  onConcluir,
}: {
  ancora: Date
  porDia: Map<string, TarefaDaAgenda[]>
  reunioesPorDia: Map<string, ReuniaoDaAgenda[]>
  vencimentosPorDia: Map<string, VencimentoProximo[]>
  onProjetoClick?: (projectId: string) => void
  onReuniaoClick: (r: ReuniaoDaAgenda) => void
  onTarefaClick?: (t: TarefaDaAgenda) => void
  onConcluir?: (t: TarefaDaAgenda, concluir: boolean) => void
}) {
  const hoje = hojeStr()
  const primeiro = new Date(ancora.getFullYear(), ancora.getMonth(), 1)
  const inicio = inicioDaSemana(primeiro)

  // Seis semanas cobrem qualquer mês, independentemente do dia em que começa.
  const dias = Array.from({ length: 42 }, (_, i) => somarDias(inicio, i))

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
        {CABECALHO_SEMANA.map((d) => (
          <div key={d} className="px-2 py-1.5 text-[10px] font-semibold text-slate-500 uppercase text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {dias.map((d) => {
          const iso = paraIso(d)
          const doMes = d.getMonth() === ancora.getMonth()
          const ehHoje = iso === hoje
          const items = porDia.get(iso) || []
          const encontros = reunioesPorDia.get(iso) || []
          const vencendo = vencimentosPorDia.get(iso) || []
          return (
            <div
              key={iso}
              className={`min-h-[92px] border-b border-r border-slate-100 p-1 space-y-0.5 ${
                doMes ? '' : 'bg-slate-50/60'
              }`}
            >
              <div
                className={`text-[10px] font-medium mb-0.5 ${
                  ehHoje
                    ? 'bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center'
                    : doMes
                      ? 'text-slate-600'
                      : 'text-slate-300'
                }`}
              >
                {d.getDate()}
              </div>
              {/* Vencimento no topo: é prazo legal do cliente, não compromisso
                  do escritório — não dá para empurrar para a semana seguinte. */}
              {vencendo.map((v) => (
                <button
                  key={v.projeto.id}
                  onClick={() => onProjetoClick?.(v.projeto.id)}
                  title={`${v.projeto.tipo} · ${v.projeto.nome} — ${descreverVencimento(v.dias)}`}
                  className="w-full flex items-center gap-1 text-left text-[10px] px-1 py-0.5 rounded bg-red-100 border border-red-300 text-red-900 hover:bg-red-200"
                >
                  <span>⏳</span>
                  <span className="truncate">
                    Vence {v.projeto.tipo}: {v.projeto.nome}
                  </span>
                </button>
              ))}

              {/* Reunião vem depois: é hora marcada com outras pessoas,
                  não dá para empurrar como uma tarefa qualquer. */}
              {encontros.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onReuniaoClick(r)}
                  title={`${r.titulo}${r.local ? ` · ${r.local}` : ''}`}
                  className="w-full flex items-center gap-1 text-left text-[10px] px-1 py-0.5 rounded bg-violet-100 border border-violet-300 text-violet-900 hover:bg-violet-200"
                >
                  <span>📅</span>
                  {r.hora_inicio && (
                    <span className="tabular-nums shrink-0">{horaCurta(r.hora_inicio)}</span>
                  )}
                  <span className="truncate">{r.titulo}</span>
                </button>
              ))}
              {items.slice(0, 4).map((t) => (
                <Pilula key={t.id} t={t} onClick={() => onTarefaClick?.(t)} onConcluir={onConcluir} />
              ))}
              {items.length > 4 && (
                <p className="text-[9px] text-slate-400 px-1">+{items.length - 4} mais</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function VisaoSemana({
  ancora,
  porDia,
  responsaveis,
  onTarefaClick,
  onConcluir,
}: {
  ancora: Date
  porDia: Map<string, TarefaDaAgenda[]>
  responsaveis: string[]
  onTarefaClick?: (t: TarefaDaAgenda) => void
  onConcluir?: (t: TarefaDaAgenda, concluir: boolean) => void
}) {
  const hoje = hojeStr()
  const inicio = inicioDaSemana(ancora)
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i))

  if (responsaveis.length === 0) {
    return (
      <p className="text-sm text-slate-400 text-center py-10 bg-white border border-slate-200 rounded-xl shadow-sm">
        Nenhuma tarefa para mostrar nesta semana.
      </p>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid" style={{ gridTemplateColumns: `140px repeat(7, 1fr)` }}>
          <div className="bg-slate-50 border-b border-r border-slate-200 px-2 py-1.5 text-[10px] font-semibold text-slate-500 uppercase">
            Responsável
          </div>
          {dias.map((d) => {
            const iso = paraIso(d)
            return (
              <div
                key={iso}
                className={`bg-slate-50 border-b border-r border-slate-200 px-2 py-1.5 text-center ${
                  iso === hoje ? 'bg-indigo-50' : ''
                }`}
              >
                <p className="text-[10px] font-semibold text-slate-500 uppercase">
                  {CABECALHO_SEMANA[d.getDay()]}
                </p>
                <p className={`text-xs ${iso === hoje ? 'text-indigo-700 font-bold' : 'text-slate-600'}`}>
                  {d.getDate()}
                </p>
              </div>
            )
          })}

          {responsaveis.map((r) => (
            <ColunaResponsavel
              key={r}
              responsavel={r}
              dias={dias}
              porDia={porDia}
              hoje={hoje}
              onTarefaClick={onTarefaClick}
              onConcluir={onConcluir}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ColunaResponsavel({
  responsavel,
  dias,
  porDia,
  hoje,
  onTarefaClick,
  onConcluir,
}: {
  responsavel: string
  dias: Date[]
  porDia: Map<string, TarefaDaAgenda[]>
  hoje: string
  onTarefaClick?: (t: TarefaDaAgenda) => void
  onConcluir?: (t: TarefaDaAgenda, concluir: boolean) => void
}) {
  return (
    <>
      <div className="border-b border-r border-slate-100 px-2 py-2 flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: corDoResponsavel(responsavel) }} />
        <span className="text-xs text-slate-700 truncate" title={responsavel}>
          {responsavel}
        </span>
      </div>
      {dias.map((d) => {
        const iso = paraIso(d)
        const items = (porDia.get(iso) || []).filter(
          (t) => (t.responsavel || 'Sem responsável').trim() === responsavel
        )
        return (
          <div
            key={iso}
            className={`min-h-[56px] border-b border-r border-slate-100 p-1 space-y-0.5 ${
              iso === hoje ? 'bg-indigo-50/40' : ''
            }`}
          >
            {items.map((t) => (
              <Pilula
                key={t.id}
                t={t}
                mostrarResponsavel={false}
                onClick={() => onTarefaClick?.(t)}
                onConcluir={onConcluir}
              />
            ))}
          </div>
        )
      })}
    </>
  )
}


/**
 * Visão de um dia com grade de horas, uma coluna por responsável.
 * Tarefas sem hora ficam na faixa "dia todo", como no Google Agenda.
 */
function VisaoDia({
  ancora,
  porDia,
  responsaveis,
  onTarefaClick,
  onNovoHorario,
  onConcluir,
  alturaCheia,
}: {
  ancora: Date
  porDia: Map<string, TarefaDaAgenda[]>
  responsaveis: string[]
  onTarefaClick?: (t: TarefaDaAgenda) => void
  onNovoHorario?: (dados: { data: string; hora: string; responsavel: string }) => void
  onConcluir?: (t: TarefaDaAgenda, concluir: boolean) => void
  /** Dentro da janela ampliada a grade usa todo o espaço disponível. */
  alturaCheia?: boolean
}) {
  const iso = paraIso(ancora)
  const doDia = porDia.get(iso) || []
  const colunas = responsaveis.length > 0 ? responsaveis : ['Sem responsável']

  const horas = Array.from({ length: HORA_FINAL - HORA_INICIAL + 1 }, (_, i) => HORA_INICIAL + i)
  const semHora = doDia.filter((t) => !t.hora_inicio)

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Cabeçalho com os responsáveis */}
      <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: `56px repeat(${colunas.length}, 1fr)` }}>
        <div className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase">Hora</div>
        {colunas.map((r) => (
          <div key={r} className="px-2 py-1.5 border-l border-slate-200 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: corDoResponsavel(r) }} />
            <span className="text-xs text-slate-700 truncate" title={r}>
              {r}
            </span>
          </div>
        ))}
      </div>

      {/* Faixa das tarefas sem hora marcada */}
      {semHora.length > 0 && (
        <div className="grid border-b border-slate-200 bg-slate-50/60" style={{ gridTemplateColumns: `56px repeat(${colunas.length}, 1fr)` }}>
          <div className="px-2 py-1 text-[10px] text-slate-400">dia todo</div>
          {colunas.map((r) => (
            <div key={r} className="px-1 py-1 border-l border-slate-200 space-y-0.5">
              {semHora
                .filter((t) => (t.responsavel || 'Sem responsável').trim() === r)
                .map((t) => (
                  <Pilula
                    key={t.id}
                    t={t}
                    mostrarResponsavel={false}
                    onClick={() => onTarefaClick?.(t)}
                    onConcluir={onConcluir}
                  />
                ))}
            </div>
          ))}
        </div>
      )}

      {/* Grade de horas */}
      <div className="relative overflow-y-auto" style={{ maxHeight: alturaCheia ? 'none' : '64vh' }}>
        <div className="grid" style={{ gridTemplateColumns: `56px repeat(${colunas.length}, 1fr)` }}>
          {/* Régua de horas */}
          <div>
            {horas.map((h) => (
              <div
                key={h}
                className="border-b border-slate-100 text-[10px] text-slate-400 px-2 pt-0.5 tabular-nums"
                style={{ height: ALTURA_HORA }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {colunas.map((r) => {
            const comHora = doDia.filter(
              (t) => t.hora_inicio && (t.responsavel || 'Sem responsável').trim() === r
            )
            return (
              <div key={r} className="relative border-l border-slate-200">
                {horas.map((h) => (
                  <div
                    key={h}
                    onClick={() =>
                      onNovoHorario?.({ data: iso, hora: `${String(h).padStart(2, '0')}:00`, responsavel: r })
                    }
                    className="border-b border-slate-100 hover:bg-indigo-50/60 cursor-pointer transition"
                    style={{ height: ALTURA_HORA }}
                    title={`Criar tarefa às ${String(h).padStart(2, '0')}:00`}
                  />
                ))}

                {comHora.map((t) => {
                  const inicio = emHoras(t.hora_inicio) ?? HORA_INICIAL
                  const fim = emHoras(t.hora_fim) ?? inicio + 1
                  const topo = (inicio - HORA_INICIAL) * ALTURA_HORA
                  // Reunião de 15 min ficaria com 16px e cortaria o nome;
                  // o piso garante uma linha de hora e uma de texto.
                  const altura = Math.max(40, (fim - inicio) * ALTURA_HORA - 2)
                  const atrasada = isTaskLate(t)
                  const concluida = t.status === 'Concluído'
                  const cor = t.task_categories?.cor || corDoResponsavel(t.responsavel)

                  return (
                    <div
                      key={t.id}
                      onClick={() => onTarefaClick?.(t)}
                      className={`absolute left-1 right-1 rounded-md px-1.5 py-0.5 text-left text-[10px] border-l-4 shadow-sm overflow-hidden cursor-pointer transition hover:brightness-95 ${
                        concluida ? 'bg-slate-100 text-slate-400' : 'bg-white text-slate-700'
                      } ${atrasada && !concluida ? 'bg-red-50 text-red-700' : ''}`}
                      style={{
                        top: topo,
                        height: altura,
                        borderLeftColor: atrasada && !concluida ? '#ef4444' : cor,
                      }}
                      title={`${faixaHoraria(t.hora_inicio, t.hora_fim)} · ${t.nome}`}
                    >
                      <div className="flex items-center gap-1">
                        {onConcluir && (
                          <MarcadorConclusao
                            concluida={concluida}
                            onToggle={() => onConcluir(t, !concluida)}
                          />
                        )}
                        <span className={`font-semibold tabular-nums ${concluida ? 'line-through' : ''}`}>
                          {faixaHoraria(t.hora_inicio, t.hora_fim)}
                        </span>
                      </div>
                      <span
                        className={`block leading-tight ${concluida ? 'line-through' : ''}`}
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {t.nome}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}


/**
 * Detalhe da reunião a partir do calendário.
 *
 * Somente leitura: quem edita a ata é o cartão do projeto, que é onde ela
 * pertence. Aqui serve para lembrar o que ficou combinado sem perder o lugar.
 */
function DetalheDaReuniao({
  reuniao,
  onFechar,
}: {
  reuniao: ReuniaoDaAgenda
  onFechar: () => void
}) {
  const [a, m, dia] = reuniao.data.split('-')
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onFechar}>
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-violet-50 border-b border-violet-200 px-5 py-3">
          <div className="flex items-start gap-2">
            <span className="text-xl">📅</span>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-violet-900">{reuniao.titulo}</h3>
              <p className="text-[11px] text-violet-800">
                {dia}/{m}/{a}
                {reuniao.hora_inicio && ` · ${faixaHoraria(reuniao.hora_inicio, reuniao.hora_fim)}`}
                {reuniao.local && ` · ${reuniao.local}`}
              </p>
              {reuniao.projects && (
                <p className="text-[10px] text-violet-700 mt-0.5">
                  {reuniao.projects.numero ? `${reuniao.projects.numero} · ` : ''}
                  {reuniao.projects.nome}
                </p>
              )}
            </div>
            <button onClick={onFechar} className="text-violet-400 hover:text-violet-700 text-lg leading-none">
              ×
            </button>
          </div>
        </div>

        <div className="px-5 py-3 space-y-3 overflow-y-auto">
          {reuniao.participantes.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-medium text-slate-500">Participantes</span>
              {reuniao.participantes.map((p) => (
                <span
                  key={p}
                  className="text-[10px] font-medium text-white rounded-full px-2 py-0.5"
                  style={{ background: corDoResponsavel(p) }}
                >
                  {p}
                </span>
              ))}
            </div>
          )}

          <div>
            <p className="text-[10px] font-medium text-slate-500 mb-1">Ata</p>
            {reuniao.ata ? (
              <p className="text-xs text-slate-700 whitespace-pre-wrap">{reuniao.ata}</p>
            ) : (
              <p className="text-xs text-amber-700">
                Ainda sem ata. Abra o cartão do projeto, aba Reuniões, para escrever.
              </p>
            )}
          </div>

          {reuniao.encaminhamentos && (
            <div>
              <p className="text-[10px] font-medium text-slate-500 mb-1">Encaminhamentos</p>
              <p className="text-xs text-slate-700 whitespace-pre-wrap">{reuniao.encaminhamentos}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
