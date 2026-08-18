import { useMemo, useState } from 'react'
import type { Project } from '../types'
import { CATEGORIAS, STATUS_COLUNAS, normalizeStatus, statusColor } from '../types'
import GanttChart from './GanttChart'
import type { GanttItem } from './GanttChart'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function GanttGlobal({ projects }: { projects: Project[] }) {
  const [statusSel, setStatusSel] = useState<string[]>([...STATUS_COLUNAS])
  const [categoriaSel, setCategoriaSel] = useState<string>('')
  const [responsavelSel, setResponsavelSel] = useState<string>('')
  const [de, setDe] = useState<string>('')
  const [ate, setAte] = useState<string>('')
  const [busca, setBusca] = useState('')
  const [soAtrasados, setSoAtrasados] = useState(false)

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
    return filtrados
      .map((p) => {
        const status = normalizeStatus(p.status)
        const end = p.data_prazo || p.data_inicio
        const late = status !== 'Concluído' && !!p.data_prazo && p.data_prazo < hoje
        return {
          id: p.id,
          label: p.numero ? `${p.numero} · ${p.nome}` : p.nome,
          sublabel: p.responsavel || undefined,
          start: p.data_inicio,
          end,
          // Atrasado ganha vermelho para saltar aos olhos; os demais seguem a cor do status.
          color: late ? '#ef4444' : statusColor(status).hex,
          textColor: status === 'Executando' && !late ? '#422006' : '#fff',
          tooltip: `${p.nome} · ${status}${late ? ' · ATRASADO' : ''}`,
        }
      })
      .sort((a, b) => a.start.localeCompare(b.start))
  }, [filtrados])

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
          {items.length} de {projects.length} projeto{projects.length !== 1 ? 's' : ''}
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
        <LegendDot color="#ef4444" label="Atrasado" />
        {STATUS_COLUNAS.map((s) => (
          <LegendDot key={s} color={statusColor(s).hex} label={s} />
        ))}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">
          Nenhum projeto encontrado com os filtros atuais.
        </p>
      ) : (
        <GanttChart items={items} labelWidth={220} rowHeight={28} />
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
