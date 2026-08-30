import { useEffect, useMemo, useState } from 'react'
import { carregarTabelaCompleta } from '../lib/supabase'
import type { Project } from '../types'
import { STATUS_COLORS, normalizeStatus, tipoColor } from '../types'
import { corDoResponsavel } from '../lib/agenda'
import { carimboDeHoje, exportarParaExcel } from '../lib/exportarExcel'

type Linha = {
  projeto: Project
  tarefas: number
  temPlano: boolean
}

type Filtro = 'ambos' | 'tarefas' | 'plano' | 'qualquer'

function dataBR(iso: string | null) {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/**
 * Projetos sem cronograma e sem planejamento.
 *
 * Projeto sem tarefa não aparece no Gantt, não gera alerta de atraso e não
 * cobra ninguém — ele existe no quadro, mas some de todo o resto do sistema.
 * É o jeito mais silencioso de um projeto ficar parado sem ninguém notar.
 *
 * Concluído fica de fora: projeto entregue não precisa de plano.
 */
export default function SemPlanejamentoReport({
  onProjectClick,
}: {
  onProjectClick?: (projectId: string) => void
}) {
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('qualquer')
  const [responsavel, setResponsavel] = useState('')
  const [incluirParados, setIncluirParados] = useState(false)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    const [projetos, tarefas, planos] = await Promise.all([
      carregarTabelaCompleta<Project>('projects'),
      carregarTabelaCompleta<{ project_id: string | null }>('project_tasks', 'project_id'),
      carregarTabelaCompleta<{ project_id: string }>('project_plans', 'project_id'),
    ])

    const porProjeto = new Map<string, number>()
    for (const t of tarefas) {
      if (!t.project_id) continue
      porProjeto.set(t.project_id, (porProjeto.get(t.project_id) || 0) + 1)
    }
    const comPlano = new Set(planos.map((p) => p.project_id))

    setLinhas(
      projetos
        .filter((p) => normalizeStatus(p.status) !== 'Concluído')
        .map((p) => ({
          projeto: p,
          tarefas: porProjeto.get(p.id) || 0,
          temPlano: comPlano.has(p.id),
        }))
    )
    setCarregando(false)
  }

  const responsaveis = useMemo(() => {
    const set = new Set<string>()
    linhas.forEach((l) => l.projeto.responsavel && set.add(l.projeto.responsavel))
    return Array.from(set).sort()
  }, [linhas])

  const filtradas = useMemo(() => {
    return linhas
      .filter((l) => {
        if (!incluirParados && normalizeStatus(l.projeto.status) === 'Zstandby') return false
        if (responsavel && l.projeto.responsavel !== responsavel) return false

        const semTarefa = l.tarefas === 0
        const semPlano = !l.temPlano
        if (filtro === 'ambos') return semTarefa && semPlano
        if (filtro === 'tarefas') return semTarefa
        if (filtro === 'plano') return semPlano
        return semTarefa || semPlano
      })
      // Quem está mais desamparado primeiro: sem nada, depois sem uma coisa só.
      .sort((a, b) => {
        const faltaA = (a.tarefas === 0 ? 1 : 0) + (a.temPlano ? 0 : 1)
        const faltaB = (b.tarefas === 0 ? 1 : 0) + (b.temPlano ? 0 : 1)
        return faltaB - faltaA || (a.projeto.numero ?? 9999) - (b.projeto.numero ?? 9999)
      })
  }, [linhas, filtro, responsavel, incluirParados])

  const contagens = useMemo(() => {
    const ativas = linhas.filter(
      (l) => incluirParados || normalizeStatus(l.projeto.status) !== 'Zstandby'
    )
    return {
      ativos: ativas.length,
      semTarefa: ativas.filter((l) => l.tarefas === 0).length,
      semPlano: ativas.filter((l) => !l.temPlano).length,
      semNada: ativas.filter((l) => l.tarefas === 0 && !l.temPlano).length,
    }
  }, [linhas, incluirParados])

  function exportar() {
    exportarParaExcel({
      nomeArquivo: `Projetos sem planejamento - ${carimboDeHoje()}.xlsx`,
      nomeAba: 'Sem planejamento',
      linhas: filtradas,
      colunas: [
        { titulo: 'Nº', valor: (l) => l.projeto.numero ?? '', largura: 6 },
        { titulo: 'Projeto', valor: (l) => l.projeto.nome, largura: 40 },
        { titulo: 'Tipo', valor: (l) => l.projeto.tipo || '', largura: 10 },
        { titulo: 'Status', valor: (l) => l.projeto.status, largura: 14 },
        { titulo: 'Responsável', valor: (l) => l.projeto.responsavel || '', largura: 14 },
        { titulo: 'Tarefas', valor: (l) => l.tarefas, largura: 9 },
        { titulo: 'Tem planejamento', valor: (l) => (l.temPlano ? 'Sim' : 'Não'), largura: 16 },
        { titulo: 'Início', valor: (l) => dataBR(l.projeto.data_inicio), largura: 12 },
        { titulo: 'Prazo', valor: (l) => dataBR(l.projeto.data_prazo), largura: 12 },
      ],
    })
  }

  if (carregando) {
    return <p className="text-sm text-slate-400 text-center py-10">Carregando...</p>
  }

  return (
    <div className="space-y-4">
      {/* ---------- Resumo ---------- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Caixa titulo="Projetos ativos" valor={contagens.ativos} />
        <Caixa
          titulo="Sem tarefa nenhuma"
          valor={contagens.semTarefa}
          destaque={contagens.semTarefa > 0}
        />
        <Caixa
          titulo="Sem planejamento"
          valor={contagens.semPlano}
          destaque={contagens.semPlano > 0}
        />
        <Caixa titulo="Sem os dois" valor={contagens.semNada} destaque={contagens.semNada > 0} />
      </div>

      <p className="text-[11px] text-slate-500">
        Projeto sem tarefa não aparece no Gantt, não gera alerta de atraso e não cobra ninguém — ele
        fica no quadro, mas some do resto do sistema. Concluídos ficam de fora desta lista.
      </p>

      {/* ---------- Filtros ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {(
            [
              ['qualquer', 'Falta alguma coisa'],
              ['ambos', 'Sem os dois'],
              ['tarefas', 'Sem tarefas'],
              ['plano', 'Sem planejamento'],
            ] as [Filtro, string][]
          ).map(([v, rotulo]) => (
            <button
              key={v}
              onClick={() => setFiltro(v)}
              className={`text-[11px] font-medium px-2.5 py-1.5 rounded-md transition ${
                filtro === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        <select
          value={responsavel}
          onChange={(e) => setResponsavel(e.target.value)}
          className="text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white"
        >
          <option value="">Todos os responsáveis</option>
          {responsaveis.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <label
          className="flex items-center gap-1.5 text-[11px] text-slate-600"
          title="Projeto parado por decisão não precisa de cronograma agora"
        >
          <input
            type="checkbox"
            checked={incluirParados}
            onChange={(e) => setIncluirParados(e.target.checked)}
          />
          Incluir parados (Zstandby)
        </label>

        <span className="ml-auto text-[11px] text-slate-500">{filtradas.length} projeto(s)</span>
        <button
          onClick={exportar}
          disabled={filtradas.length === 0}
          className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white"
        >
          ⬇ Excel
        </button>
      </div>

      {/* ---------- Lista ---------- */}
      {filtradas.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl py-10 text-center">
          <p className="text-3xl mb-2">✓</p>
          <p className="text-sm text-slate-600">Nenhum projeto neste recorte.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-200">
                <th className="text-left py-2 pl-4">Projeto</th>
                <th className="text-left">Tipo</th>
                <th className="text-left">Status</th>
                <th className="text-left">Responsável</th>
                <th className="text-left">O que falta</th>
                <th className="text-left pr-4">Prazo</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l) => {
                const cor = STATUS_COLORS[normalizeStatus(l.projeto.status)]
                return (
                  <tr
                    key={l.projeto.id}
                    onClick={() => onProjectClick?.(l.projeto.id)}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="py-2 pl-4 max-w-[280px]">
                      <span className="text-slate-400 tabular-nums mr-1.5">
                        {l.projeto.numero ?? ''}
                      </span>
                      <span className="font-medium text-slate-800">{l.projeto.nome}</span>
                    </td>
                    <td>
                      {l.projeto.tipo && (
                        <span
                          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${tipoColor(
                            l.projeto.tipo
                          )}`}
                        >
                          {l.projeto.tipo}
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                          cor?.badge || 'bg-slate-100 text-slate-600 border-slate-300'
                        }`}
                      >
                        {l.projeto.status}
                      </span>
                    </td>
                    <td>
                      {l.projeto.responsavel && (
                        <span
                          className="text-[11px] font-medium"
                          style={{ color: corDoResponsavel(l.projeto.responsavel) }}
                        >
                          {l.projeto.responsavel}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {l.tarefas === 0 ? (
                          <span className="text-[10px] font-medium text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
                            sem tarefas
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">
                            {l.tarefas} tarefa{l.tarefas === 1 ? '' : 's'}
                          </span>
                        )}
                        {!l.temPlano && (
                          <span className="text-[10px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                            sem planejamento
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="pr-4 text-slate-400 tabular-nums">
                      {dataBR(l.projeto.data_prazo)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Caixa({
  titulo,
  valor,
  destaque,
}: {
  titulo: string
  valor: number
  destaque?: boolean
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5">
      <p className="text-[10px] uppercase text-slate-400">{titulo}</p>
      <p
        className={`text-xl font-semibold tabular-nums ${
          destaque ? 'text-amber-700' : 'text-slate-800'
        }`}
      >
        {valor}
      </p>
    </div>
  )
}
