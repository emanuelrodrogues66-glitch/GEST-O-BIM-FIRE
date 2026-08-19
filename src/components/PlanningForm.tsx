import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ProjectPlan, ProjectPlanPhase } from '../types'
import { STATUS_COLUNAS, statusColor } from '../types'

function diasEntre(a: string, b: string): number {
  if (!a || !b) return 0
  const d1 = new Date(a).getTime()
  const d2 = new Date(b).getTime()
  return Math.round((d2 - d1) / 86400000) + 1
}

export default function PlanningForm({ projectId }: { projectId: string }) {
  const [plan, setPlan] = useState<Partial<ProjectPlan>>({})
  const [phases, setPhases] = useState<ProjectPlanPhase[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [mostrarFases, setMostrarFases] = useState(false)
  const [novaFase, setNovaFase] = useState({ status: STATUS_COLUNAS[0] as string, data_inicio: '', data_fim: '' })

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function load() {
    setLoading(true)
    const [{ data: planData }, { data: phaseData }] = await Promise.all([
      supabase.from('project_plans').select('*').eq('project_id', projectId).maybeSingle(),
      supabase
        .from('project_plan_phases')
        .select('*')
        .eq('project_id', projectId)
        .order('data_inicio', { ascending: true }),
    ])
    setPlan((planData as ProjectPlan) || {})
    const fases = (phaseData as ProjectPlanPhase[]) || []
    setPhases(fases)
    if (fases.length > 0) setMostrarFases(true)
    setLoading(false)
  }

  /**
   * Datas do projeto derivadas das fases:
   * — início = começo da primeira fase;
   * — fim = término da fase "Concluído" (é ela que marca a entrega).
   * Sem fase de conclusão, usa o término mais distante como aproximação.
   */
  function derivarDasFases(fases: ProjectPlanPhase[]): { inicio: string | null; fim: string | null } {
    if (fases.length === 0) return { inicio: null, fim: null }

    const inicio = fases.reduce((min, f) => (f.data_inicio < min ? f.data_inicio : min), fases[0].data_inicio)

    const conclusoes = fases.filter((f) => f.status === 'Concluído')
    const fim = conclusoes.length
      ? conclusoes.reduce((max, f) => (f.data_fim > max ? f.data_fim : max), conclusoes[0].data_fim)
      : fases.reduce((max, f) => (f.data_fim > max ? f.data_fim : max), fases[0].data_fim)

    return { inicio, fim }
  }

  /** Mantém início e fim previstos em dia sempre que as fases mudam. */
  async function sincronizarComFases(fases: ProjectPlanPhase[]) {
    const { inicio, fim } = derivarDasFases(fases)
    if (!inicio && !fim) return

    const proximo = {
      ...plan,
      data_inicio_prevista: inicio || plan.data_inicio_prevista || null,
      data_fim_prevista: fim || plan.data_fim_prevista || null,
    }

    // Nada mudou: evita gravação desnecessária.
    if (
      proximo.data_inicio_prevista === plan.data_inicio_prevista &&
      proximo.data_fim_prevista === plan.data_fim_prevista
    ) {
      return
    }

    setPlan(proximo)
    const { error } = await supabase.from('project_plans').upsert(
      {
        project_id: projectId,
        data_inicio_prevista: proximo.data_inicio_prevista,
        data_fim_prevista: proximo.data_fim_prevista,
        observacoes: proximo.observacoes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id' }
    )
    if (error) setErro(error.message)
  }

  async function savePlan(patch: Partial<ProjectPlan>) {
    const next = { ...plan, ...patch }
    setPlan(next)
    setSaving(true)
    setErro(null)
    const { error } = await supabase.from('project_plans').upsert(
      {
        project_id: projectId,
        data_inicio_prevista: next.data_inicio_prevista || null,
        data_fim_prevista: next.data_fim_prevista || null,
        observacoes: next.observacoes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id' }
    )
    if (error) setErro(error.message)
    setSaving(false)
  }

  async function addFase() {
    if (!novaFase.data_inicio || !novaFase.data_fim) return
    if (novaFase.data_fim < novaFase.data_inicio) {
      setErro('A data final da fase não pode ser anterior à inicial.')
      return
    }
    setErro(null)
    const { data, error } = await supabase
      .from('project_plan_phases')
      .insert({
        project_id: projectId,
        status: novaFase.status,
        data_inicio: novaFase.data_inicio,
        data_fim: novaFase.data_fim,
        ordem: phases.length,
      })
      .select()
      .single()
    if (error) {
      setErro(error.message)
      return
    }
    const atualizadas = [...phases, data as ProjectPlanPhase].sort((a, b) =>
      a.data_inicio.localeCompare(b.data_inicio)
    )
    setPhases(atualizadas)
    setNovaFase({ status: STATUS_COLUNAS[0], data_inicio: '', data_fim: '' })
    sincronizarComFases(atualizadas)
  }

  async function removeFase(id: string) {
    const atualizadas = phases.filter((f) => f.id !== id)
    setPhases(atualizadas)
    await supabase.from('project_plan_phases').delete().eq('id', id)
    sincronizarComFases(atualizadas)
  }

  async function updateFase(id: string, patch: Partial<ProjectPlanPhase>) {
    const atualizadas = phases.map((f) => (f.id === id ? { ...f, ...patch } : f))
    setPhases(atualizadas)
    const { error } = await supabase.from('project_plan_phases').update(patch).eq('id', id)
    if (error) {
      setErro(error.message)
      return
    }
    sincronizarComFases(atualizadas)
  }

  if (loading) return <p className="text-xs text-slate-400">Carregando planejamento...</p>

  const totalDias = diasEntre(plan.data_inicio_prevista || '', plan.data_fim_prevista || '')
  const temFases = phases.length > 0
  const temFaseConcluido = phases.some((f) => f.status === 'Concluído')

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Defina o prazo <b>previsto</b> do projeto. No Gantt global, ele aparece como uma barra em meio-tom logo
        abaixo da barra real — assim dá para comparar o planejado com o que de fato aconteceu.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1.5">
            Início previsto
            {temFases && (
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                das fases
              </span>
            )}
          </label>
          <input
            type="date"
            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
              temFases ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-300'
            }`}
            value={plan.data_inicio_prevista || ''}
            onChange={(e) => savePlan({ data_inicio_prevista: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1.5">
            Fim previsto
            {temFases && (
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                {temFaseConcluido ? 'da fase Concluído' : 'da última fase'}
              </span>
            )}
          </label>
          <input
            type="date"
            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
              temFases ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-300'
            }`}
            value={plan.data_fim_prevista || ''}
            onChange={(e) => savePlan({ data_fim_prevista: e.target.value })}
          />
        </div>
      </div>

      {temFases && (
        <p className="text-[11px] text-slate-500 -mt-2">
          {temFaseConcluido
            ? 'Estas datas vêm do detalhamento de fases: o fim é o término da fase Concluído. Alterar as fases atualiza os dois campos.'
            : 'Estas datas vêm do detalhamento de fases. Adicione uma fase "Concluído" para o fim previsto marcar a entrega.'}
        </p>
      )}

      {totalDias > 0 && (
        <p className="text-[11px] text-slate-500 -mt-2">
          Duração prevista: <b>{totalDias}</b> dia{totalDias !== 1 ? 's' : ''}
        </p>
      )}

      {plan.data_inicio_prevista &&
        plan.data_fim_prevista &&
        plan.data_fim_prevista < plan.data_inicio_prevista && (
          <p className="text-xs text-red-600">O fim previsto está antes do início previsto.</p>
        )}

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Observações do planejamento</label>
        <textarea
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          rows={2}
          placeholder="Premissas, dependências, riscos previstos..."
          value={plan.observacoes || ''}
          onChange={(e) => setPlan((p) => ({ ...p, observacoes: e.target.value }))}
          onBlur={(e) => savePlan({ observacoes: e.target.value })}
        />
      </div>

      <div className="border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-medium text-slate-500">
            Detalhar fases previstas <span className="text-slate-400 font-normal">(opcional)</span>
          </label>
          <button
            onClick={() => setMostrarFases((v) => !v)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            {mostrarFases ? 'Ocultar' : 'Detalhar fases'}
          </button>
        </div>

        {mostrarFases && (
          <>
            <p className="text-[11px] text-slate-400 mb-2">
              Informe o período previsto de cada status. A barra planejada fica colorida por fase, igual à real.
            </p>

            <div className="space-y-1.5">
              {phases.map((f) => (
                <div
                  key={f.id}
                  className="flex flex-wrap items-center gap-2 border border-slate-200 rounded-lg px-2.5 py-1.5"
                >
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded border ${statusColor(f.status).badge}`}
                  >
                    {f.status}
                  </span>
                  <input
                    type="date"
                    className="border border-slate-200 rounded px-1.5 py-0.5 text-[11px]"
                    value={f.data_inicio}
                    onChange={(e) => updateFase(f.id, { data_inicio: e.target.value })}
                  />
                  <span className="text-slate-300 text-[11px]">→</span>
                  <input
                    type="date"
                    className="border border-slate-200 rounded px-1.5 py-0.5 text-[11px]"
                    value={f.data_fim}
                    onChange={(e) => updateFase(f.id, { data_fim: e.target.value })}
                  />
                  <span className="text-[10px] text-slate-400">
                    {diasEntre(f.data_inicio, f.data_fim)} dia
                    {diasEntre(f.data_inicio, f.data_fim) !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => removeFase(f.id)}
                    className="ml-auto text-slate-300 hover:text-red-500 px-1"
                    title="Remover fase"
                  >
                    ×
                  </button>
                </div>
              ))}

              {phases.length === 0 && (
                <p className="text-xs text-slate-400 py-1">Nenhuma fase prevista cadastrada.</p>
              )}
            </div>

            <div className="border border-dashed border-slate-300 rounded-lg p-2.5 mt-2 bg-slate-50 flex flex-wrap items-center gap-2">
              <select
                className="text-[11px] border border-slate-300 rounded px-2 py-1 bg-white"
                value={novaFase.status}
                onChange={(e) => setNovaFase((f) => ({ ...f, status: e.target.value }))}
              >
                {STATUS_COLUNAS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className="border border-slate-300 rounded px-1.5 py-1 text-[11px]"
                value={novaFase.data_inicio}
                onChange={(e) => setNovaFase((f) => ({ ...f, data_inicio: e.target.value }))}
              />
              <span className="text-slate-300 text-[11px]">→</span>
              <input
                type="date"
                className="border border-slate-300 rounded px-1.5 py-1 text-[11px]"
                value={novaFase.data_fim}
                onChange={(e) => setNovaFase((f) => ({ ...f, data_fim: e.target.value }))}
              />
              <button
                onClick={addFase}
                disabled={!novaFase.data_inicio || !novaFase.data_fim}
                className="ml-auto px-3 py-1 text-[11px] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md font-medium"
              >
                + Adicionar fase
              </button>
            </div>
          </>
        )}
      </div>

      {erro && <p className="text-xs text-red-600">{erro}</p>}
      {saving && <p className="text-[10px] text-slate-400">Salvando...</p>}
    </div>
  )
}
