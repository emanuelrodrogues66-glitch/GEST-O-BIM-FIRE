import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DailyProgress, Project, ProjectPlan, ProjectPlanPhase } from '../types'
import { CATEGORIAS, STATUS_COLUNAS, STATUS_TO_LETRA, normalizeStatus, statusColor } from '../types'
import GanttChart from './GanttChart'
import type { GanttItem, GanttSegment } from './GanttChart'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

/** Letra do progresso diário -> cor do status correspondente. */
const LETRA_PARA_STATUS: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_TO_LETRA).map(([status, letra]) => [letra, status])
)

const COR_INICIO = '#15803d' // letra S · verde escuro

function corDaLetra(letra: string): string {
  const L = letra.toUpperCase()
  if (L === 'S') return COR_INICIO
  const status = LETRA_PARA_STATUS[L]
  return status ? statusColor(status).hex : '#cbd5e1'
}

function rotuloDaLetra(letra: string): string {
  const L = letra.toUpperCase()
  if (L === 'S') return 'Início'
  return LETRA_PARA_STATUS[L] || L
}

function proximoDia(data: string): string {
  const d = new Date(`${data}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Agrupa os dias do progresso diário em faixas contínuas de mesma letra.
 * Ex.: P,P,P,T,T,C vira 3 trechos coloridos em vez de 6 quadradinhos.
 */
function montarSegmentos(dias: DailyProgress[]): GanttSegment[] {
  if (dias.length === 0) return []
  const ordenados = [...dias].sort((a, b) => a.data.localeCompare(b.data))
  const segmentos: GanttSegment[] = []

  let atual = {
    letra: ordenados[0].letra,
    inicio: ordenados[0].data,
    fim: ordenados[0].data,
  }

  for (let i = 1; i < ordenados.length; i++) {
    const d = ordenados[i]
    const continua = d.letra === atual.letra && d.data === proximoDia(atual.fim)
    if (continua) {
      atual.fim = d.data
    } else {
      segmentos.push({
        start: atual.inicio,
        end: atual.fim,
        color: corDaLetra(atual.letra),
        label: rotuloDaLetra(atual.letra),
      })
      atual = { letra: d.letra, inicio: d.data, fim: d.data }
    }
  }

  segmentos.push({
    start: atual.inicio,
    end: atual.fim,
    color: corDaLetra(atual.letra),
    label: rotuloDaLetra(atual.letra),
  })

  return segmentos
}

export default function GanttGlobal({ projects }: { projects: Project[] }) {
  const [statusSel, setStatusSel] = useState<string[]>([...STATUS_COLUNAS])
  const [categoriaSel, setCategoriaSel] = useState<string>('')
  const [responsavelSel, setResponsavelSel] = useState<string>('')
  const [de, setDe] = useState<string>('')
  const [ate, setAte] = useState<string>('')
  const [busca, setBusca] = useState('')
  const [soAtrasados, setSoAtrasados] = useState(false)
  const [mostrarPlanejado, setMostrarPlanejado] = useState(true)

  const [progressoPorProjeto, setProgressoPorProjeto] = useState<Record<string, DailyProgress[]>>({})
  const [planos, setPlanos] = useState<Record<string, ProjectPlan>>({})
  const [fasesPorProjeto, setFasesPorProjeto] = useState<Record<string, ProjectPlanPhase[]>>({})
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    carregarDados()
  }, [])

  async function carregarDados() {
    setCarregando(true)
    const [{ data: progresso }, { data: planosData }, { data: fases }] = await Promise.all([
      supabase.from('daily_progress').select('*'),
      supabase.from('project_plans').select('*'),
      supabase.from('project_plan_phases').select('*'),
    ])

    const mapaProgresso: Record<string, DailyProgress[]> = {}
    ;(progresso as DailyProgress[] | null)?.forEach((d) => {
      if (!mapaProgresso[d.project_id]) mapaProgresso[d.project_id] = []
      mapaProgresso[d.project_id].push(d)
    })
    setProgressoPorProjeto(mapaProgresso)

    const mapaPlanos: Record<string, ProjectPlan> = {}
    ;(planosData as ProjectPlan[] | null)?.forEach((p) => {
      mapaPlanos[p.project_id] = p
    })
    setPlanos(mapaPlanos)

    const mapaFases: Record<string, ProjectPlanPhase[]> = {}
    ;(fases as ProjectPlanPhase[] | null)?.forEach((f) => {
      if (!mapaFases[f.project_id]) mapaFases[f.project_id] = []
      mapaFases[f.project_id].push(f)
    })
    setFasesPorProjeto(mapaFases)

    setCarregando(false)
  }

  const responsaveis = useMemo(() => {
    const set = new Set(projects.map((p) => p.responsavel).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [projects])

  function toggleStatus(s: string) {
    setStatusSel((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  const filtrados = useMemo(() => {
    const hoje = todayStr()
    return projects.filter((p) => {
      if (!p.data_inicio) return false

      const status = normalizeStatus(p.status)
      if (statusSel.length > 0 && !statusSel.includes(status)) return false
      if (categoriaSel && p.categoria !== categoriaSel) return false
      if (responsavelSel && p.responsavel !== responsavelSel) return false
      if (busca && !p.nome.toLowerCase().includes(busca.toLowerCase())) return false

      // Intervalo de datas: mantém o projeto se ele tiver qualquer sobreposição
      // com o período escolhido (não exige estar inteiramente dentro dele).
      const inicio = p.data_inicio
      const fim = p.data_prazo || p.data_inicio
      if (de && fim < de) return false
      if (ate && inicio > ate) return false

      if (soAtrasados) {
        const atrasado = status !== 'Concluído' && !!p.data_prazo && p.data_prazo < hoje
        if (!atrasado) return false
      }

      return true
    })
  }, [projects, statusSel, categoriaSel, responsavelSel, busca, de, ate, soAtrasados])

  const items: GanttItem[] = useMemo(() => {
    const hoje = todayStr()
    const ordenados = [...filtrados].sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))
    const linhas: GanttItem[] = []

    for (const p of ordenados) {
      const status = normalizeStatus(p.status)
      const end = p.data_prazo || p.data_inicio
      const late = status !== 'Concluído' && !!p.data_prazo && p.data_prazo < hoje

      // Barra REAL: segmentada pelo histórico do progresso diário.
      const dias = progressoPorProjeto[p.id] || []
      const segmentos = montarSegmentos(dias)

      // Se houver histórico, a barra cobre do primeiro registro até o fim do prazo.
      const inicioReal = segmentos.length ? segmentos[0].start : p.data_inicio
      const fimReal = segmentos.length
        ? [end, segmentos[segmentos.length - 1].end].sort().reverse()[0]
        : end

      linhas.push({
        id: p.id,
        label: p.numero ? `${p.numero} · ${p.nome}` : p.nome,
        sublabel: p.responsavel || undefined,
        start: inicioReal < p.data_inicio ? inicioReal : p.data_inicio,
        end: fimReal,
        color: late ? '#ef4444' : statusColor(status).hex,
        textColor: status === 'Executando' && !late ? '#422006' : '#fff',
        segments: segmentos.length ? segmentos : undefined,
        tooltip: segmentos.length
          ? `${p.nome} · real · ${segmentos.map((s) => s.label).filter((v, i, a) => a.indexOf(v) === i).join(' → ')}${late ? ' · ATRASADO' : ''}`
          : `${p.nome} · ${status}${late ? ' · ATRASADO' : ''}`,
      })

      // Barra PLANEJADA: meio-tom, logo abaixo da real.
      if (mostrarPlanejado) {
        const plano = planos[p.id]
        const fases = (fasesPorProjeto[p.id] || []).sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))

        const inicioPrev = plano?.data_inicio_prevista || (fases.length ? fases[0].data_inicio : null)
        const fimPrev =
          plano?.data_fim_prevista || (fases.length ? fases[fases.length - 1].data_fim : null)

        if (inicioPrev && fimPrev) {
          const segsPlano: GanttSegment[] = fases.map((f) => ({
            start: f.data_inicio,
            end: f.data_fim,
            color: statusColor(f.status).hex,
            label: f.status,
          }))

          const atrasoDias =
            fimPrev && p.data_prazo
              ? Math.round(
                  (new Date(`${p.data_prazo}T00:00:00Z`).getTime() -
                    new Date(`${fimPrev}T00:00:00Z`).getTime()) /
                    86400000
                )
              : 0

          linhas.push({
            id: `${p.id}__plano`,
            label: p.nome,
            sublabel: 'Planejado',
            start: inicioPrev,
            end: fimPrev,
            color: '#94a3b8',
            segments: segsPlano.length ? segsPlano : undefined,
            muted: true,
            hideLabel: true,
            attached: true,
            tooltip:
              `Planejado: ${inicioPrev.split('-').reverse().join('/')} → ${fimPrev.split('-').reverse().join('/')}` +
              (atrasoDias > 0
                ? ` · ${atrasoDias} dia${atrasoDias !== 1 ? 's' : ''} além do previsto`
                : atrasoDias < 0
                  ? ` · ${Math.abs(atrasoDias)} dia${Math.abs(atrasoDias) !== 1 ? 's' : ''} adiantado`
                  : ''),
          })
        }
      }
    }

    return linhas
  }, [filtrados, progressoPorProjeto, planos, fasesPorProjeto, mostrarPlanejado])

  const todosMarcados = statusSel.length === STATUS_COLUNAS.length
  const temFiltro = !!(categoriaSel || responsavelSel || de || ate || busca || soAtrasados || !todosMarcados)

  function limparFiltros() {
    setStatusSel([...STATUS_COLUNAS])
    setCategoriaSel('')
    setResponsavelSel('')
    setDe('')
    setAte('')
    setBusca('')
    setSoAtrasados(false)
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">Gantt global · início e prazo dos projetos</h3>
        <span className="text-xs text-slate-400">
          {filtrados.length} de {projects.length} projeto{projects.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2 mb-4">
        {/* Filtro por status */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-slate-500 mr-1">Status:</span>
          {STATUS_COLUNAS.map((s) => {
            const ativo = statusSel.includes(s)
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={`text-[11px] font-medium px-2 py-1 rounded-full border transition flex items-center gap-1.5 ${
                  ativo ? statusColor(s).badge : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full inline-block ${ativo ? statusColor(s).dot : 'bg-slate-300'}`}
                />
                {s}
              </button>
            )
          })}
          <button
            onClick={() => setStatusSel(todosMarcados ? [] : [...STATUS_COLUNAS])}
            className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium ml-1"
          >
            {todosMarcados ? 'Limpar' : 'Todos'}
          </button>
        </div>

        {/* Demais filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-[11px] text-slate-500">
            De
            <input
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1 text-xs"
            />
          </label>
          <label className="flex items-center gap-1 text-[11px] text-slate-500">
            Até
            <input
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1 text-xs"
            />
          </label>

          <select
            value={categoriaSel}
            onChange={(e) => setCategoriaSel(e.target.value)}
            className="text-xs border border-slate-300 rounded-md px-2 py-1 bg-white"
          >
            <option value="">Todas as categorias</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={responsavelSel}
            onChange={(e) => setResponsavelSel(e.target.value)}
            className="text-xs border border-slate-300 rounded-md px-2 py-1 bg-white"
          >
            <option value="">Todos os responsáveis</option>
            {responsaveis.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <input
            placeholder="Buscar projeto..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="text-xs border border-slate-300 rounded-md px-2 py-1 bg-white flex-1 min-w-[140px] max-w-[220px]"
          />

          <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={soAtrasados}
              onChange={(e) => setSoAtrasados(e.target.checked)}
            />
            Só atrasados
          </label>

          <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={mostrarPlanejado}
              onChange={(e) => setMostrarPlanejado(e.target.checked)}
            />
            Mostrar planejado
          </label>

          {temFiltro && (
            <button
              onClick={limparFiltros}
              className="text-[11px] text-slate-500 hover:text-slate-800 underline ml-auto"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-[10px] text-slate-500 mb-2 flex-wrap">
        <LegendDot color={COR_INICIO} label="Início" />
        {STATUS_COLUNAS.map((s) => (
          <LegendDot key={s} color={statusColor(s).hex} label={s} />
        ))}
        <LegendDot color="#ef4444" label="Atrasado" />
        <span className="flex items-center gap-1 text-slate-400">
          <span className="w-4 h-2 rounded-sm inline-block border border-dashed border-slate-400 bg-slate-300 opacity-50" />
          Planejado (meio-tom)
        </span>
      </div>

      <p className="text-[10px] text-slate-400 mb-2">
        A barra cheia mostra o percurso <b>real</b> do projeto, colorido por status conforme o progresso diário.
        A barra tracejada logo abaixo é o <b>planejado</b>, definido na aba Planejamento de cada cartão.
      </p>

      {carregando ? (
        <p className="text-xs text-slate-400 py-8 text-center">Carregando histórico e planejamento...</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">
          Nenhum projeto encontrado com os filtros atuais.
        </p>
      ) : (
        <GanttChart items={items} labelWidth={220} rowHeight={30} />
      )}
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
      {label}
    </span>
  )
}
