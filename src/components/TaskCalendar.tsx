import { useMemo, useState } from 'react'
import type { TarefaDaAgenda } from '../lib/agenda'
import { corDoResponsavel, hojeStr, inicioDaSemana, paraData, paraIso, somarDias } from '../lib/agenda'
import { isTaskLate } from '../types'

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const CABECALHO_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

type Visao = 'mes' | 'semana'

export default function TaskCalendar({
  tarefas,
  onTarefaClick,
}: {
  tarefas: TarefaDaAgenda[]
  onTarefaClick?: (t: TarefaDaAgenda) => void
}) {
  const [visao, setVisao] = useState<Visao>('mes')
  const [ancora, setAncora] = useState<Date>(() => paraData(hojeStr()))
  const [responsavelFiltro, setResponsavelFiltro] = useState('')

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
    return mapa
  }, [visiveis])

  function navegar(delta: number) {
    setAncora((a) => (visao === 'mes' ? new Date(a.getFullYear(), a.getMonth() + delta, 1) : somarDias(a, delta * 7)))
  }

  const titulo =
    visao === 'mes'
      ? `${NOMES_MES[ancora.getMonth()]} ${ancora.getFullYear()}`
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
            ] as [Visao, string][]
          ).map(([v, rotulo]) => (
            <button
              key={v}
              onClick={() => setVisao(v)}
              className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
                visao === v ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        <select
          value={responsavelFiltro}
          onChange={(e) => setResponsavelFiltro(e.target.value)}
          className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
        >
          <option value="">Todos os responsáveis</option>
          {responsaveis.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {responsaveis.slice(0, 8).map((r) => (
            <span key={r} className="flex items-center gap-1 text-[10px] text-slate-500">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: corDoResponsavel(r) }} />
              {r}
            </span>
          ))}
        </div>
      </div>

      {visao === 'mes' ? (
        <VisaoMes ancora={ancora} porDia={porDia} onTarefaClick={onTarefaClick} />
      ) : (
        <VisaoSemana
          ancora={ancora}
          porDia={porDia}
          responsaveis={responsavelFiltro ? [responsavelFiltro] : responsaveis}
          onTarefaClick={onTarefaClick}
        />
      )}
    </div>
  )
}

function Pilula({
  t,
  onClick,
  mostrarResponsavel = true,
}: {
  t: TarefaDaAgenda
  onClick?: () => void
  mostrarResponsavel?: boolean
}) {
  const atrasada = isTaskLate(t)
  const concluida = t.status === 'Concluído'
  const cor = t.task_categories?.cor || corDoResponsavel(t.responsavel)

  return (
    <button
      onClick={onClick}
      title={`${t.nome}${t.responsavel ? ` · ${t.responsavel}` : ''}${
        t.projects ? ` · ${t.projects.nome}` : ' · tarefa geral'
      }${atrasada ? ' · ATRASADA' : ''}`}
      className={`w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate border-l-2 transition hover:brightness-95 ${
        concluida ? 'line-through text-slate-400 bg-slate-50' : 'text-slate-700 bg-slate-50'
      } ${atrasada && !concluida ? 'bg-red-50 text-red-700' : ''}`}
      style={{ borderLeftColor: atrasada && !concluida ? '#ef4444' : cor }}
    >
      {mostrarResponsavel && t.responsavel && (
        <span className="font-semibold" style={{ color: corDoResponsavel(t.responsavel) }}>
          {t.responsavel.split(' ')[0]}{' '}
        </span>
      )}
      {t.nome}
    </button>
  )
}

function VisaoMes({
  ancora,
  porDia,
  onTarefaClick,
}: {
  ancora: Date
  porDia: Map<string, TarefaDaAgenda[]>
  onTarefaClick?: (t: TarefaDaAgenda) => void
}) {
  const hoje = hojeStr()
  const primeiro = new Date(ancora.getFullYear(), ancora.getMonth(), 1)
  const inicio = inicioDaSemana(primeiro)

  // Seis semanas cobrem qualquer mês, independentemente do dia em que começa.
  const dias = Array.from({ length: 42 }, (_, i) => somarDias(inicio, i))

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
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
              {items.slice(0, 4).map((t) => (
                <Pilula key={t.id} t={t} onClick={() => onTarefaClick?.(t)} />
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
}: {
  ancora: Date
  porDia: Map<string, TarefaDaAgenda[]>
  responsaveis: string[]
  onTarefaClick?: (t: TarefaDaAgenda) => void
}) {
  const hoje = hojeStr()
  const inicio = inicioDaSemana(ancora)
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i))

  if (responsaveis.length === 0) {
    return (
      <p className="text-sm text-slate-400 text-center py-10 bg-white border border-slate-200 rounded-xl">
        Nenhuma tarefa para mostrar nesta semana.
      </p>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
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
}: {
  responsavel: string
  dias: Date[]
  porDia: Map<string, TarefaDaAgenda[]>
  hoje: string
  onTarefaClick?: (t: TarefaDaAgenda) => void
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
              <Pilula key={t.id} t={t} mostrarResponsavel={false} onClick={() => onTarefaClick?.(t)} />
            ))}
          </div>
        )
      })}
    </>
  )
}
