import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { syncDailyProgressForStatus } from '../lib/statusSync'
import { abrirPendencia, fecharPendencia, nomeDoUsuario, pendenciaAberta } from '../lib/pendencias'
import { alertarCorrecao, comemorarConclusao } from '../lib/celebracao'
import { usePerfil } from '../lib/perfil'
import type { DailyProgress, Project, ProjectClient } from '../types'
import {
  MOTIVOS_PENDENCIA,
  STATUS_COLUNAS,
  PRO_LIMITE_M2,
  PRO_PONTOS_GRANDE,
  PRO_PONTOS_PEQUENO,
  anexosObrigatoriosFaltando,
  isClientDataComplete,
  suggestedPoints,
} from '../types'
import type { MonthRef } from '../lib/month'
import { addMonths, daysInMonth, monthLabel, monthRange } from '../lib/month'
import TaskSchedule from './TaskSchedule'
import ActivityHistory from './ActivityHistory'
import ClientDataForm from './ClientDataForm'
import FileUpload from './FileUpload'
import PlanningForm from './PlanningForm'
import CorrectionsTab from './CorrectionsTab'
import PendenciesTab from './PendenciesTab'
import HistoryTab from './HistoryTab'
import ProjectFinanceTab from './ProjectFinanceTab'
import MeetingsTab from './MeetingsTab'
import TermoEntregaButton from './TermoEntregaButton'

const LETRA_OPTIONS = [
  { value: '', label: '—' },
  { value: 'S', label: 'S · Início' },
  { value: 'P', label: 'P · Pendente' },
  { value: 'E', label: 'E · Executando' },
  { value: 'T', label: 'T · Tramitando' },
  { value: 'C', label: 'C · Correção' },
  { value: 'D', label: 'D · Concluído' },
  { value: 'Z', label: 'Z · Zstandby' },
]

const LETRA_COLORS: Record<string, string> = {
  S: 'bg-emerald-700 text-white',
  P: 'bg-sky-200 text-sky-800',
  E: 'bg-yellow-300 text-yellow-900',
  T: 'bg-pink-200 text-pink-800',
  C: 'bg-red-400 text-white',
  D: 'bg-emerald-300 text-emerald-900',
  Z: 'bg-slate-300 text-slate-700',
  '': 'bg-white text-slate-300',
}

/** "2026-08" a partir de um mês. */
function monthKeyDe(m: MonthRef): string {
  return `${m.year}-${String(m.month).padStart(2, '0')}`
}

/** "2026-08" vira "Agosto 2026". */
function rotuloMes(chave: string): string {
  const [ano, mes] = chave.split('-').map(Number)
  return monthLabel({ year: ano, month: mes })
}

type Props = {
  project: Project | null
  isNew: boolean
  responsaveis: string[]
  month: MonthRef
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}

export default function ProjectModal({ project, isNew, responsaveis, month, onClose, onSaved, onDeleted }: Props) {
  const emptyProject: Partial<Project> = {
    nome: '',
    responsavel: '',
    status: 'Pendente',
    tipo: 'PRO',
    // PRO só tem pontuação depois que a área é informada.
    pts: null,
    m2: null,
    categoria: 'PROJETOS EM ANDAMENTO',
    prazo_categoria: null,
    data_prazo: null,
    data_inicio: monthRange(month).start,
    observacoes: '',
  }

  const [form, setForm] = useState<Partial<Project>>(project ?? emptyProject)
  const [saving, setSaving] = useState(false)

  // Pontuação e exclusão são do administrador. Na criação o campo continua
  // liberado, porque aí ele só recebe a sugestão automática do tipo.
  const { ehAdmin } = usePerfil()
  // Equipe do escritório: alimenta a escolha de participantes das reuniões.
  const [equipeDoEscritorio, setEquipeDoEscritorio] = useState<string[]>([])

  useEffect(() => {
    supabase
      .from('team_members')
      .select('nome')
      .eq('ativo', true)
      .order('ordem')
      .then(({ data }) => setEquipeDoEscritorio(((data as { nome: string }[]) || []).map((m) => m.nome)))
  }, [])
  const podeEditarPontos = ehAdmin || isNew
  const [progress, setProgress] = useState<Record<number, string>>({})

  // O progresso diário navega por mês por conta própria: projetos antigos
  // precisam ser corrigidos em meses anteriores sem mexer no filtro do topo.
  const [mesProgresso, setMesProgresso] = useState<MonthRef>(month)
  const [mesesComRegistro, setMesesComRegistro] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<
    'geral' | 'dados' | 'plano' | 'correcoes' | 'pendencias' | 'historico' | 'reunioes' | 'financeiro'
  >('geral')
  const [clientData, setClientData] = useState<Partial<ProjectClient>>({})
  const [showMissingClientData, setShowMissingClientData] = useState(false)

  // Justificativa exigida ao passar o projeto para Pendente.
  const [motivoPendencia, setMotivoPendencia] = useState<string>(MOTIVOS_PENDENCIA[0])
  const [justificativaPendencia, setJustificativaPendencia] = useState('')
  const [previsaoPendencia, setPrevisaoPendencia] = useState('')
  const [exigirPendencia, setExigirPendencia] = useState(false)
  const [pendenciaJaAberta, setPendenciaJaAberta] = useState(false)

  // Mostra o formulário só quando o projeto está de fato entrando em Pendente.
  const entrandoEmPendente =
    !isNew && !!project && form.status === 'Pendente' && project.status !== 'Pendente' && !pendenciaJaAberta

  useEffect(() => {
    setForm(project ?? emptyProject)
    setActiveTab('geral')
    setShowMissingClientData(false)
    setJustificativaPendencia('')
    setPrevisaoPendencia('')
    setExigirPendencia(false)
    setMotivoPendencia(MOTIVOS_PENDENCIA[0])
    setMesProgresso(month)
    if (project && !isNew) {
      loadProgress(project.id, month)
      loadMesesComRegistro(project.id)
      loadClientData(project.id)
      pendenciaAberta(project.id).then((p) => setPendenciaJaAberta(!!p))
    } else {
      setProgress({})
      setMesesComRegistro([])
      setClientData({})
      setPendenciaJaAberta(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, isNew, month])

  async function loadProgress(projectId: string, mes: MonthRef) {
    const { start, end } = monthRange(mes)
    const { data } = await supabase
      .from('daily_progress')
      .select('*')
      .eq('project_id', projectId)
      .gte('data', start)
      .lte('data', end)
    const map: Record<number, string> = {}
    ;(data as DailyProgress[] | null)?.forEach((d) => {
      const day = Number(d.data.split('-')[2])
      map[day] = d.letra
    })
    setProgress(map)
  }

  /** Meses que já têm registro, para o usuário saltar direto até eles. */
  async function loadMesesComRegistro(projectId: string) {
    const { data } = await supabase
      .from('daily_progress')
      .select('data')
      .eq('project_id', projectId)
      .order('data', { ascending: true })

    const meses = new Set<string>()
    ;(data as { data: string }[] | null)?.forEach((d) => meses.add(d.data.slice(0, 7)))
    setMesesComRegistro(Array.from(meses))
  }

  async function loadClientData(projectId: string) {
    const { data } = await supabase.from('project_clients').select('*').eq('project_id', projectId).maybeSingle()
    setClientData((data as Partial<ProjectClient>) || {})
  }

  /** Troca o mês do progresso diário sem mexer no filtro geral do app. */
  function navegarProgresso(delta: number) {
    const novo = addMonths(mesProgresso, delta)
    setMesProgresso(novo)
    if (project) loadProgress(project.id, novo)
  }

  function irParaMes(chave: string) {
    const [ano, mes] = chave.split('-').map(Number)
    const novo = { year: ano, month: mes }
    setMesProgresso(novo)
    if (project) loadProgress(project.id, novo)
  }

  async function handleDayChange(day: number, letra: string) {
    if (!project) return
    const dateStr = `${mesProgresso.year}-${String(mesProgresso.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    setProgress((p) => ({ ...p, [day]: letra }))
    if (letra === '') {
      await supabase.from('daily_progress').delete().eq('project_id', project.id).eq('data', dateStr)
    } else {
      await supabase.from('daily_progress').upsert(
        { project_id: project.id, data: dateStr, letra },
        { onConflict: 'project_id,data' }
      )
    }
    // Um mês que ganhou o primeiro registro passa a valer no atalho.
    loadMesesComRegistro(project.id)
  }

  async function handleSave() {
    // Passar para Pendente exige justificativa — é o que alimenta o histórico
    // de pendências e permite medir quanto tempo o projeto ficou parado.
    if (
      !isNew &&
      project &&
      form.status === 'Pendente' &&
      project.status !== 'Pendente' &&
      !pendenciaJaAberta &&
      !justificativaPendencia.trim()
    ) {
      setError('Informe a justificativa da pendência antes de salvar.')
      setExigirPendencia(true)
      setActiveTab('geral')
      return
    }

    // Bloqueia a conclusão do projeto se os dados do cliente ou os anexos
    // obrigatórios não estiverem completos.
    if (form.status === 'Concluído') {
      if (!isClientDataComplete(clientData)) {
        setError('Preencha todos os campos da aba "Dados do cliente" antes de concluir o projeto.')
        setShowMissingClientData(true)
        setActiveTab('dados')
        return
      }

      if (project) {
        const { data: arquivos } = await supabase
          .from('project_files')
          .select('categoria')
          .eq('project_id', project.id)

        const faltando = anexosObrigatoriosFaltando(
          clientData,
          (arquivos as { categoria: string | null }[]) || []
        )
        if (faltando.length > 0) {
          setError(
            `Faltam anexos obrigatórios para concluir: ${faltando.join(', ')}. ` +
              'Se for memorial simplificado ou TAC, marque a caixa de dispensa na aba "Dados do cliente".'
          )
          setActiveTab('dados')
          return
        }
      }
    }

    setSaving(true)
    setError(null)
    try {
      const payload = {
        nome: form.nome,
        responsavel: form.responsavel || null,
        status: form.status,
        tipo: form.tipo || null,
        pts: form.pts === undefined || form.pts === null || (form.pts as any) === '' ? null : Number(form.pts),
        m2: form.m2 === undefined || form.m2 === null || (form.m2 as any) === '' ? null : Number(form.m2),
        categoria: form.categoria,
        prazo_categoria: form.prazo_categoria || null,
        data_prazo: form.data_prazo || null,
        data_inicio: form.data_inicio || monthRange(month).start,
        observacoes: form.observacoes || null,
      }

      let projectId = project?.id

      if (isNew) {
        const { data, error } = await supabase.from('projects').insert(payload).select().single()
        if (error) throw error
        projectId = (data as Project).id
      } else if (project) {
        const { error } = await supabase.from('projects').update(payload).eq('id', project.id)
        if (error) throw error

        if (form.status && form.status !== project.status) {
          await syncDailyProgressForStatus(project.id, form.status)

          // Entrou em Pendente: abre o registro com a justificativa informada.
          if (form.status === 'Pendente') {
            await abrirPendencia(project.id, project.status, {
              motivo: motivoPendencia,
              justificativa: justificativaPendencia,
              previsao_retorno: previsaoPendencia || null,
              responsavel: await nomeDoUsuario(),
            })
          } else {
            // Saiu de Pendente: encerra o período e registra a duração.
            await fecharPendencia(project.id)
          }
        }
      }

      // Salva os dados do cliente (se algum campo foi preenchido, ou se já existia registro).
      if (projectId) {
        const hasAnyClientField = Object.values(clientData).some((v) => (v || '').toString().trim())
        if (hasAnyClientField) {
          const { error: clientError } = await supabase
            .from('project_clients')
            .upsert({ ...clientData, project_id: projectId }, { onConflict: 'project_id' })
          if (clientError) throw clientError
        }
      }

      // Avisos de mudança de status: comemoração ao concluir, alerta ao entrar em correção.
      if (form.status !== project?.status) {
        if (form.status === 'Concluído') comemorarConclusao()
        else if (form.status === 'CORREÇÃO') alertarCorrecao(form.nome || project?.nome)
      }

      onSaved()
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Compara o formulário com o projeto original para saber se há edição pendente.
   * As demais abas (planejamento, correções, arquivos) salvam sozinhas,
   * então só a aba Geral e os dados do cliente precisam desse aviso.
   */
  function temAlteracaoNaoSalva(): boolean {
    if (isNew) {
      return !!(form.nome?.trim() || form.responsavel?.trim() || form.observacoes?.trim())
    }
    if (!project) return false
    const campos: (keyof Project)[] = [
      'nome',
      'responsavel',
      'status',
      'tipo',
      'pts',
      'm2',
      'categoria',
      'prazo_categoria',
      'data_prazo',
      'data_inicio',
      'observacoes',
    ]
    return campos.some((c) => {
      const atual = (form as any)[c]
      const original = (project as any)[c]
      const a = atual === null || atual === undefined ? '' : String(atual)
      const b = original === null || original === undefined ? '' : String(original)
      return a !== b
    })
  }

  function handleClose() {
    if (temAlteracaoNaoSalva()) {
      if (!confirm('Você tem alterações não salvas nesta tela. Fechar mesmo assim?')) return
    }
    onClose()
  }

  async function handleDelete() {
    if (!project) return
    if (!ehAdmin) {
      alert('Somente o administrador pode excluir projetos.')
      return
    }
    if (!confirm(`Excluir "${project.nome}"? Essa ação não pode ser desfeita.`)) return
    setSaving(true)
    await supabase.from('projects').delete().eq('id', project.id)
    setSaving(false)
    onDeleted()
  }

  return (
    // Sem fechar ao clicar fora: só pelo X ou Cancelar, para não perder
    // o que já foi preenchido por um clique acidental.
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="text-lg font-semibold text-slate-800">
            {isNew ? 'Novo projeto' : 'Editar projeto'}
          </h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">
            ×
          </button>
        </div>

        {!isNew && project && (
          <div className="sticky top-[65px] bg-white border-b border-slate-200 px-6 flex gap-1 z-10">
            {(
              [
                ['geral', 'Geral'],
                ['dados', 'Dados do cliente'],
                ['plano', 'Planejamento'],
                ['correcoes', 'Correções'],
                ['pendencias', 'Pendências'],
                ['reunioes', 'Reuniões'],
                ['historico', 'Histórico'],
                // Valor e custo são do ADM; a aba nem aparece para os demais.
                ...(ehAdmin ? ([['financeiro', 'Financeiro']] as const) : []),
              ] as [
                'geral' | 'dados' | 'plano' | 'correcoes' | 'pendencias' | 'historico' | 'reunioes' | 'financeiro',
                string,
              ][]
            ).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-sm font-medium px-3 py-2 border-b-2 -mb-px transition ${
                  activeTab === tab
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="p-6 space-y-4">
          {activeTab === 'reunioes' && !isNew && project ? (
            <MeetingsTab projectId={project.id} equipe={equipeDoEscritorio} />
          ) : activeTab === 'financeiro' && !isNew && project ? (
            <ProjectFinanceTab projectId={project.id} />
          ) : activeTab === 'historico' && !isNew && project ? (
            <HistoryTab projectId={project.id} />
          ) : activeTab === 'pendencias' && !isNew && project ? (
            <PendenciesTab projectId={project.id} />
          ) : activeTab === 'correcoes' && !isNew && project ? (
            <CorrectionsTab project={project} client={clientData} />
          ) : activeTab === 'plano' && !isNew && project ? (
            <PlanningForm projectId={project.id} />
          ) : activeTab === 'dados' && !isNew && project ? (
            <>
              {/* O termo sai daqui porque é aqui que moram os dados que ele usa. */}
              <div className="flex justify-end -mt-1">
                <TermoEntregaButton projeto={project} cliente={clientData} />
              </div>

              <ClientDataForm
                value={clientData}
                onChange={(patch) => setClientData((c) => ({ ...c, ...patch }))}
                showMissing={showMissingClientData}
              />
              <FileUpload
                projectId={project.id}
                folderName={clientData.nome_pasta}
                dispensaUpload={clientData.dispensa_upload}
              />
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Nome do projeto</label>
                <input
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={form.nome || ''}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Responsável</label>
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    list="responsaveis-list"
                    value={form.responsavel || ''}
                    onChange={(e) => setForm({ ...form, responsavel: e.target.value })}
                  />
                  <datalist id="responsaveis-list">
                    {responsaveis.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={form.status || 'Pendente'}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    {STATUS_COLUNAS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Justificativa obrigatória ao deixar o projeto pendente */}
              {entrandoEmPendente && (
                <div
                  className={`border rounded-lg p-3 space-y-2.5 ${
                    exigirPendencia && !justificativaPendencia.trim()
                      ? 'border-red-400 bg-red-50/40'
                      : 'border-sky-300 bg-sky-50/50'
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-700">
                    Por que o projeto está ficando pendente?
                  </p>
                  <p className="text-[11px] text-slate-500 -mt-1">
                    Fica registrado na aba Pendências, com a contagem de dias parado.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">Motivo</label>
                      <select
                        className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs bg-white"
                        value={motivoPendencia}
                        onChange={(e) => setMotivoPendencia(e.target.value)}
                      >
                        {MOTIVOS_PENDENCIA.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">
                        Previsão de retorno <span className="text-slate-400 font-normal">(opcional)</span>
                      </label>
                      <input
                        type="date"
                        className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs bg-white"
                        value={previsaoPendencia}
                        onChange={(e) => setPrevisaoPendencia(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">
                      Justificativa <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      className={`w-full border rounded-md px-2 py-1.5 text-xs bg-white ${
                        exigirPendencia && !justificativaPendencia.trim()
                          ? 'border-red-400'
                          : 'border-slate-300'
                      }`}
                      rows={2}
                      placeholder="Ex.: cliente ficou de enviar a planta assinada até sexta."
                      value={justificativaPendencia}
                      onChange={(e) => setJustificativaPendencia(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {pendenciaJaAberta && form.status === 'Pendente' && (
                <p className="text-[11px] bg-sky-50 border border-sky-200 text-sky-800 rounded-lg px-3 py-2">
                  Este projeto já tem uma pendência em aberto. Veja e edite na aba <b>Pendências</b>.
                </p>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Tipo</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={form.tipo || ''}
                    onChange={(e) => {
                      const tipo = e.target.value
                      const suggested = suggestedPoints(tipo, form.m2)
                      // Sem permissão para mexer nos pontos, trocar o tipo não
                      // pode arrastar a pontuação junto — o banco recusaria.
                      setForm((f) => ({
                        ...f,
                        tipo,
                        pts: podeEditarPontos && suggested != null ? suggested : f.pts,
                      }))
                    }}
                  >
                    {['PRO', 'MEM', 'TCAC', 'HAB', 'FUNC', 'Vistoria'].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Pontos {!podeEditarPontos && <span title="Somente o administrador">🔒</span>}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    disabled={!podeEditarPontos}
                    title={
                      podeEditarPontos
                        ? undefined
                        : 'Somente o administrador pode alterar a pontuação'
                    }
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                      podeEditarPontos
                        ? 'border-slate-300'
                        : 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'
                    }`}
                    value={form.pts ?? ''}
                    onChange={(e) => setForm({ ...form, pts: e.target.value as any })}
                  />
                  {!podeEditarPontos ? (
                    <p className="text-[10px] text-amber-700 mt-1">
                      Alteração só com autorização do administrador.
                    </p>
                  ) : (
                    (suggestedPoints(form.tipo, form.m2) != null ? (
                      <p className="text-[10px] text-slate-400 mt-1">
                        Sugestão automática para {form.tipo}
                        {form.tipo === 'PRO' &&
                          ` (${Number(form.m2) > PRO_LIMITE_M2 ? 'acima de' : 'até'} ${PRO_LIMITE_M2.toLocaleString('pt-BR')} m²)`}
                        : {suggestedPoints(form.tipo, form.m2)} pts
                      </p>
                    ) : (
                      form.tipo === 'PRO' && (
                        <p className="text-[10px] text-amber-700 mt-1">
                          Informe a área para calcular os pontos: acima de{' '}
                          {PRO_LIMITE_M2.toLocaleString('pt-BR')} m² vale {PRO_PONTOS_GRANDE}, até isso vale{' '}
                          {PRO_PONTOS_PEQUENO.toLocaleString('pt-BR')}.
                        </p>
                      )
                    ))
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Área (m²)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={form.m2 ?? ''}
                    onChange={(e) => {
                      const m2 = e.target.value
                      // A área é que define a pontuação do PRO, então mexer
                      // nela recalcula os pontos junto.
                      const suggested = suggestedPoints(form.tipo, m2)
                      setForm((f) => ({
                        ...f,
                        m2: m2 as any,
                        pts: podeEditarPontos && suggested != null ? suggested : f.pts,
                      }))
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Data de início</label>
                  <input
                    type="date"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={form.data_inicio || ''}
                    onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Define em qual mês o projeto aparece nos filtros.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Categoria do prazo</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={form.prazo_categoria || ''}
                    onChange={(e) => setForm({ ...form, prazo_categoria: e.target.value || null })}
                  >
                    <option value="">—</option>
                    <option value="ATRASADO">ATRASADO</option>
                    <option value="ESSA SEMANA">ESSA SEMANA</option>
                    <option value="NO PRAZO">NO PRAZO</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Data prazo</label>
                  <input
                    type="date"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={form.data_prazo || ''}
                    onChange={(e) => setForm({ ...form, data_prazo: e.target.value || null })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Observações</label>
                <textarea
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  rows={2}
                  value={form.observacoes || ''}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                />
              </div>

              {!isNew && project && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <label className="block text-xs font-medium text-slate-500">Progresso diário</label>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Navegação de mês própria: dá para corrigir meses antigos
                          sem mexer no filtro do topo do app. */}
                      <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-1 py-0.5">
                        <button
                          onClick={() => navegarProgresso(-1)}
                          className="w-6 h-6 text-slate-500 hover:bg-slate-100 rounded"
                          title="Mês anterior"
                        >
                          ‹
                        </button>
                        <span className="text-[11px] font-semibold text-slate-700 px-1 min-w-[100px] text-center">
                          {monthLabel(mesProgresso)}
                        </span>
                        <button
                          onClick={() => navegarProgresso(1)}
                          className="w-6 h-6 text-slate-500 hover:bg-slate-100 rounded"
                          title="Próximo mês"
                        >
                          ›
                        </button>
                      </div>

                      {mesesComRegistro.length > 0 && (
                        <select
                          value={monthKeyDe(mesProgresso)}
                          onChange={(e) => irParaMes(e.target.value)}
                          className="text-[11px] border border-slate-300 rounded-lg px-2 py-1 bg-white"
                          title="Meses que já têm registro neste projeto"
                        >
                          {!mesesComRegistro.includes(monthKeyDe(mesProgresso)) && (
                            <option value={monthKeyDe(mesProgresso)}>
                              {monthLabel(mesProgresso)} (vazio)
                            </option>
                          )}
                          {mesesComRegistro.map((m) => (
                            <option key={m} value={m}>
                              {rotuloMes(m)}
                            </option>
                          ))}
                        </select>
                      )}

                      {monthKeyDe(mesProgresso) !== monthKeyDe(month) && (
                        <button
                          onClick={() => irParaMes(monthKeyDe(month))}
                          className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          voltar para {monthLabel(month)}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1.5">
                    {Array.from({ length: daysInMonth(mesProgresso) }, (_, i) => i + 1).map((day) => {
                      const letra = progress[day] || ''
                      return (
                        <select
                          key={day}
                          value={letra}
                          onChange={(e) => handleDayChange(day, e.target.value)}
                          className={`text-[10px] text-center rounded-md py-1 border border-slate-200 cursor-pointer ${LETRA_COLORS[letra] || LETRA_COLORS['']}`}
                          title={`Dia ${day}`}
                        >
                          {LETRA_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {day} {opt.value && `· ${opt.value}`}
                            </option>
                          ))}
                        </select>
                      )
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-slate-500">
                    {LETRA_OPTIONS.filter((o) => o.value).map((o) => (
                      <span key={o.value} className={`px-1.5 py-0.5 rounded ${LETRA_COLORS[o.value]}`}>
                        {o.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {!isNew && project && (
                <div className="border-t border-slate-100 pt-4">
                  <TaskSchedule projectId={project.id} responsaveis={responsaveis} />
                </div>
              )}

              {!isNew && project && (
                <div className="border-t border-slate-100 pt-4">
                  <ActivityHistory
                    projectId={project.id}
                    responsaveis={responsaveis}
                    responsavelDoProjeto={form.responsavel || project.responsavel}
                  />
                </div>
              )}
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between rounded-b-2xl">
          {!isNew && ehAdmin ? (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Excluir projeto
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.nome}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-medium"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
