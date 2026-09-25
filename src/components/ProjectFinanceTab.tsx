import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermissoes } from '../lib/permissoes'
import type { Gatilho, ProjectExpense, ProjectFinance, ProjectInstallment, TeamCost } from '../lib/financeiro'
import { horasLegiveis } from '../types'
import {
  CATEGORIAS_DESPESA,
  GATILHOS,
  PARCELAMENTO_PADRAO,
  custoHoraNaData,

  pct,
  reais,
  rotuloDoGatilho,
} from '../lib/financeiro'

function hojeStr() {
  return new Date().toISOString().slice(0, 10)
}

function formatarData(d: string | null) {
  if (!d) return '—'
  const [a, m, dia] = d.split('-')
  return `${dia}/${m}/${a}`
}

/** Datas que o sistema já registra e que liberam parcela para cobrança. */
/** Fase do planejamento: é dela que sai a previsão de quando a parcela entra. */
type Fase = { status: string; data_inicio: string | null; data_fim: string | null; ordem: number }

type DatasDoProjeto = {
  data_contrato: string | null
  data_protocolo: string | null
  data_aprovacao: string | null
}

/**
 * Financeiro de um projeto: valor, parcelas por etapa, despesas diretas e a
 * margem que sobra depois do custo apropriado.
 *
 * Só o ADM chega aqui, e o bloqueio de verdade está nas políticas do banco.
 */
export default function ProjectFinanceTab({ projectId }: { projectId: string }) {
  const { pode, carregando: carregandoPerfil } = usePermissoes()
  // Quem só lança custo indireto entra por aqui: vê a aba, mas não o contrato.
  const ehAdmin = pode('fin.contrato.ver') || pode('fin.despesas.ver')
  const podeContrato = pode('fin.contrato.editar')
  const podeDespesas = pode('fin.despesas.editar')
  const veContrato = pode('fin.contrato.ver')

  const [ficha, setFicha] = useState<ProjectFinance | null>(null)
  const [parcelas, setParcelas] = useState<ProjectInstallment[]>([])
  const [inicioMensal, setInicioMensal] = useState('')
  // Parcelamento rapido: "5x todo dia 10" e o jeito como a conversa com o
  // cliente acontece; o resto (divisao, datas, sobra de centavo) e conta nossa.
  const [vezes, setVezes] = useState('')
  const [diaDoMes, setDiaDoMes] = useState('10')
  const [despesas, setDespesas] = useState<ProjectExpense[]>([])
  const [datas, setDatas] = useState<DatasDoProjeto>({
    data_contrato: null,
    data_protocolo: null,
    data_aprovacao: null,
  })
  const [fases, setFases] = useState<Fase[]>([])
  const [custoMaoDeObra, setCustoMaoDeObra] = useState(0)
  const [horasApropriadas, setHorasApropriadas] = useState(0)
  const [horasEstimadas, setHorasEstimadas] = useState(0)
  const [diasSemCusto, setDiasSemCusto] = useState<string[]>([])
  const [carregando, setCarregando] = useState(true)

  const [valor, setValor] = useState('')

  // Servico que renova (vistoria, SPDA): guarda o que o cartao sabe sobre a
  // recorrencia para oferecer o lancamento do ano.
  const [projeto, setProjeto] = useState<{
    tipo: string | null
    renovacao_meses: number | null
    data_vencimento: string | null
    projeto_origem_id: string | null
  } | null>(null)
  const [formRenovacao, setFormRenovacao] = useState<null | {
    ano: string
    valor: string
    previsao: string
    recebido: boolean
    dataRecebimento: string
  }>(null)
  const renovaAnual = !!projeto?.renovacao_meses
  const [salvandoValor, setSalvandoValor] = useState(false)
  const [novaDespesa, setNovaDespesa] = useState({
    data: hojeStr(),
    categoria: CATEGORIAS_DESPESA[0],
    descricao: '',
    valor: '',
  })

  useEffect(() => {
    if (ehAdmin) carregar()
    else setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ehAdmin, projectId])

  useEffect(() => {
    let vivo = true
    supabase
      .from('projects')
      .select('tipo, renovacao_meses, data_vencimento, projeto_origem_id')
      .eq('id', projectId)
      .maybeSingle()
      .then(({ data }) => {
        if (vivo) setProjeto((data as typeof projeto) || null)
      })
    return () => {
      vivo = false
    }
  }, [projectId])

  async function carregar() {
    setCarregando(true)
    const [f, p, d, cliente, custos, fases] = await Promise.all([
      supabase.from('project_finance').select('*').eq('project_id', projectId).maybeSingle(),
      supabase.from('project_installments').select('*').eq('project_id', projectId).order('ordem'),
      supabase.from('project_expenses').select('*').eq('project_id', projectId).order('data'),
      supabase
        .from('project_clients')
        .select('data_contrato, data_protocolo, data_aprovacao')
        .eq('project_id', projectId)
        .maybeSingle(),
      supabase.from('team_costs').select('*'),
      // O planejamento é o que datá as parcelas que dependem de fase.
      supabase
        .from('project_plan_phases')
        .select('status, data_inicio, data_fim, ordem')
        .eq('project_id', projectId)
        .order('ordem'),
    ])
    setFases((fases.data as Fase[]) || [])

    const fichaAtual = (f.data as ProjectFinance) || null
    setFicha(fichaAtual)
    setValor(fichaAtual?.valor_contrato?.toString() || '')
    setParcelas((p.data as ProjectInstallment[]) || [])
    setDespesas((d.data as ProjectExpense[]) || [])
    setDatas(
      (cliente.data as DatasDoProjeto) || {
        data_contrato: null,
        data_protocolo: null,
        data_aprovacao: null,
      }
    )

    await calcularMaoDeObra((custos.data as TeamCost[]) || [])
    setCarregando(false)
  }

  /**
   * Custo de mão de obra do projeto.
   *
   * O "assumir projeto" diário é a apropriação de horas: quem registrou dois
   * projetos no mesmo dia gastou meio dia em cada. Não pedimos hora exata de
   * propósito — mais um campo obrigatório mataria o hábito de registrar, que é
   * o que alimenta este número.
   */
  async function calcularMaoDeObra(custos: TeamCost[]) {
    const { data } = await supabase
      .from('project_activities')
      .select('responsavel, data, horas, horas_estimadas')
      .eq('project_id', projectId)

    const linhas =
      (data as { responsavel: string; data: string; horas: number | null; horas_estimadas: boolean }[]) ||
      []

    let total = 0
    let horas = 0
    let estimadas = 0
    const faltando = new Set<string>()

    for (const l of linhas) {
      // Sem hora registrada não dá para custear: o dia inteiro seria um chute.
      const h = Number(l.horas) || 0
      if (h <= 0) continue

      const hora = custoHoraNaData(custos, l.responsavel, l.data)
      if (hora === null) {
        faltando.add(l.responsavel)
        continue
      }
      total += hora * h
      horas += h
      if (l.horas_estimadas) estimadas += h
    }

    setCustoMaoDeObra(total)
    setHorasApropriadas(horas)
    setHorasEstimadas(estimadas)
    setDiasSemCusto(Array.from(faltando))
  }

  const totalDespesas = useMemo(
    () => despesas.reduce((s, d) => s + Number(d.valor), 0),
    [despesas]
  )
  const custoTotal = custoMaoDeObra + totalDespesas
  const valorContrato = Number(ficha?.valor_contrato) || 0
  const recebido = useMemo(
    () => parcelas.filter((p) => p.data_recebimento).reduce((s, p) => s + Number(p.valor), 0),
    [parcelas]
  )
  const aReceber = useMemo(
    () => parcelas.filter((p) => !p.data_recebimento).reduce((s, p) => s + Number(p.valor), 0),
    [parcelas]
  )
  const somaParcelas = recebido + aReceber

  const margemContratada = valorContrato - custoTotal
  const margemRealizada = recebido - custoTotal

  /**
   * Quando a parcela deve entrar, segundo o planejamento.
   *
   * Vale só enquanto o gatilho não aconteceu de verdade: assim que a data real
   * é registrada, é ela que manda. Previsão serve para planejar caixa, não
   * para contar história depois do fato.
   */
  function previstaEm(p: ProjectInstallment): string | null {
    if (p.data_prevista) return p.data_prevista
    const fim = (s: string) => {
      const doStatus = fases.filter((f) => f.status === s)
      return doStatus.length ? doStatus[doStatus.length - 1].data_fim : null
    }
    const inicio = (s: string) => fases.find((f) => f.status === s)?.data_inicio || null
    if (p.gatilho === 'protocolo') return inicio('Tramitando')
    if (p.gatilho === 'aprovacao') return fim('Tramitando')
    if (p.gatilho === 'entrega') {
      const fins = (fases.map((f) => f.data_fim).filter(Boolean) as string[]).sort()
      return fins.length ? fins[fins.length - 1] : null
    }
    if (p.gatilho === 'entrada' || p.gatilho === 'avista') return datas.data_contrato
    return null
  }

  /** Data que libera a parcela, quando o gatilho tem data registrada. */
  function liberadaEm(p: ProjectInstallment): string | null {
    const campo = GATILHOS.find((g) => g.valor === p.gatilho)?.campo
    return campo ? datas[campo] : null
  }

  async function salvarValor() {
    setSalvandoValor(true)
    const novo = valor ? Number(valor) : null
    const { error } = await supabase
      .from('project_finance')
      .upsert(
        { project_id: projectId, valor_contrato: novo, updated_at: new Date().toISOString() },
        { onConflict: 'project_id' }
      )
    setSalvandoValor(false)
    if (error) {
      alert(error.message)
      return
    }
    carregar()
  }

  /** Cria as três parcelas da casa a partir do valor já cadastrado. */
  async function aplicarPadrao() {
    if (!valorContrato) {
      alert('Cadastre o valor do contrato antes de gerar as parcelas.')
      return
    }
    if (parcelas.length > 0 && !confirm('Isto substitui as parcelas atuais. Continuar?')) return

    await supabase.from('project_installments').delete().eq('project_id', projectId)
    const novas = PARCELAMENTO_PADRAO.map((m, i) => ({
      project_id: projectId,
      ordem: i + 1,
      descricao: m.descricao,
      gatilho: m.gatilho,
      percentual: m.percentual,
      valor: Number(((valorContrato * m.percentual) / 100).toFixed(2)),
    }))
    const { error } = await supabase.from('project_installments').insert(novas)
    if (error) alert(error.message)
    carregar()
  }

  /**
   * Renovacao anual: a vistoria do ano que vem e um recebimento novo, e nao
   * uma parcela do contrato antigo. O valor vem sugerido do ano anterior
   * porque quase sempre e o mesmo, so reajustado.
   */
  async function abrirRenovacao() {
    const hoje = hojeStr()
    const ano = projeto?.data_vencimento ? projeto.data_vencimento.slice(0, 4) : hoje.slice(0, 4)
    let sugerido = valorContrato
    if (!sugerido && projeto?.projeto_origem_id) {
      const { data } = await supabase
        .from('project_finance')
        .select('valor_contrato')
        .eq('project_id', projeto.projeto_origem_id)
        .maybeSingle()
      sugerido = Number((data as { valor_contrato: number | null } | null)?.valor_contrato) || 0
    }
    setFormRenovacao({
      ano,
      valor: sugerido ? String(sugerido) : '',
      previsao: projeto?.data_vencimento || hoje,
      recebido: false,
      dataRecebimento: hoje,
    })
  }

  async function salvarRenovacao() {
    if (!formRenovacao) return
    const valorRenovacao = Number(String(formRenovacao.valor).replace(',', '.')) || 0
    if (!valorRenovacao) {
      alert('Informe o valor da renovacao.')
      return
    }
    const descricao = 'Renovacao ' + formRenovacao.ano
    const repetida = parcelas.some(
      (p) => (p.descricao || '').trim().toLowerCase() === descricao.toLowerCase()
    )
    if (repetida && !confirm('Ja existe um lancamento com esse nome. Lancar assim mesmo?')) return

    const { error } = await supabase.from('project_installments').insert({
      project_id: projectId,
      ordem: parcelas.length + 1,
      descricao,
      gatilho: 'outro',
      valor: valorRenovacao,
      data_prevista: formRenovacao.previsao || null,
      data_recebimento: formRenovacao.recebido
        ? formRenovacao.dataRecebimento || hojeStr()
        : null,
    })
    if (error) {
      alert(error.message)
      return
    }
    setFormRenovacao(null)
    carregar()
  }

  /**
   * Divide o contrato em N parcelas mensais no mesmo dia do mes.
   *
   * A primeira cai no proximo dia escolhido que ainda nao passou. A sobra dos
   * centavos vai na ultima parcela, para a soma bater com o contrato — sem
   * isso, 1.000 em 3 vezes vira 999,99 e o fluxo de caixa fica devendo.
   */
  async function parcelarEmVezes() {
    const n = Math.floor(Number(vezes) || 0)
    const dia = Math.min(Math.max(Math.floor(Number(diaDoMes) || 1), 1), 31)
    if (n < 1) {
      alert('Informe em quantas vezes.')
      return
    }
    if (!valorContrato) {
      alert('Cadastre o valor do contrato antes de parcelar.')
      return
    }
    if (parcelas.length > 0 && !confirm('Isto substitui as parcelas atuais. Continuar?')) return

    const centavos = Math.round(valorContrato * 100)
    const base = Math.floor(centavos / n)
    const sobra = centavos - base * n

    const hoje = new Date()
    // Se o dia do mes ja passou, a primeira parcela cai no mes que vem.
    const primeiroMes = hoje.getDate() <= dia ? hoje.getMonth() : hoje.getMonth() + 1

    const novas = []
    for (let i = 0; i < n; i++) {
      const mes = new Date(hoje.getFullYear(), primeiroMes + i, 1)
      const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()
      const quando =
        mes.getFullYear() +
        '-' +
        String(mes.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(Math.min(dia, ultimo)).padStart(2, '0')
      const valorParcela = (base + (i === n - 1 ? sobra : 0)) / 100
      novas.push({
        project_id: projectId,
        ordem: i + 1,
        descricao: 'Parcela ' + (i + 1) + '/' + n,
        gatilho: 'outro',
        percentual: null,
        valor: valorParcela,
        data_prevista: quando,
      })
    }

    await supabase.from('project_installments').delete().eq('project_id', projectId)
    const { error } = await supabase.from('project_installments').insert(novas)
    if (error) {
      alert(error.message)
      return
    }
    setVezes('')
    carregar()
  }

  async function adicionarParcela() {
    const { error } = await supabase.from('project_installments').insert({
      project_id: projectId,
      ordem: parcelas.length + 1,
      descricao: 'Nova parcela',
      gatilho: 'outro',
      valor: 0,
    })
    if (error) alert(error.message)
    carregar()
  }

  async function atualizarParcela(id: string, patch: Partial<ProjectInstallment>) {
    setParcelas((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
    const { error } = await supabase
      .from('project_installments')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      alert(error.message)
      carregar()
    }
  }

  /**
   * Parcelamento que nao depende de fase nao tem de onde tirar data: o fluxo de
   * caixa fica com as parcelas soltas em "sem previsao". Aqui basta a data da
   * primeira — as outras caem de mes em mes, na ordem da lista.
   */
  async function datarMensalmente() {
    const emAberto = parcelas.filter((p) => !p.data_recebimento && !p.data_prevista)
    if (!inicioMensal || emAberto.length === 0) return
    const [ano, mes, dia] = inicioMensal.split('-').map(Number)
    for (let i = 0; i < emAberto.length; i++) {
      const base = new Date(ano, mes - 1 + i, 1)
      const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
      base.setDate(Math.min(dia, ultimo))
      const iso =
        base.getFullYear() +
        '-' +
        String(base.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(base.getDate()).padStart(2, '0')
      await atualizarParcela(emAberto[i].id, { data_prevista: iso })
    }
    setInicioMensal('')
  }

  async function excluirParcela(p: ProjectInstallment) {
    if (!confirm(`Apagar a parcela "${p.descricao}"?`)) return
    await supabase.from('project_installments').delete().eq('id', p.id)
    carregar()
  }

  async function adicionarDespesa() {
    const v = Number(novaDespesa.valor)
    if (!v || v <= 0) return
    const { error } = await supabase.from('project_expenses').insert({
      project_id: projectId,
      data: novaDespesa.data,
      categoria: novaDespesa.categoria,
      descricao: novaDespesa.descricao.trim() || null,
      valor: v,
    })
    if (error) {
      alert(error.message)
      return
    }
    setNovaDespesa({ data: hojeStr(), categoria: CATEGORIAS_DESPESA[0], descricao: '', valor: '' })
    carregar()
  }

  async function excluirDespesa(d: ProjectExpense) {
    if (!confirm('Apagar esta despesa?')) return
    await supabase.from('project_expenses').delete().eq('id', d.id)
    carregar()
  }

  async function alternarSemCusto() {
    await supabase.from('project_finance').upsert(
      {
        project_id: projectId,
        sem_custo_apurado: !ficha?.sem_custo_apurado,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id' }
    )
    carregar()
  }

  if (carregandoPerfil || carregando) {
    return <p className="text-sm text-slate-400 py-6">Carregando...</p>
  }

  if (!ehAdmin) {
    return (
      <div className="text-center py-10">
        <p className="text-3xl mb-2">🔒</p>
        <p className="text-sm font-medium text-slate-700">Área restrita</p>
        <p className="text-xs text-slate-500 mt-1">
          Valores e custos só são visíveis para o administrador.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ---------- Valor do contrato ---------- */}
      {veContrato && (
      <div className="border border-slate-200 rounded-lg p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-slate-500">Valor do contrato (R$)</span>
            <input
              type="number"
              step="0.01"
              value={valor}
              disabled={!podeContrato}
              onChange={(e) => setValor(e.target.value)}
              onBlur={salvarValor}
              placeholder="0,00"
              className="w-40 border border-slate-300 rounded-md px-2 py-1.5 text-sm font-medium"
            />
          </label>
          {salvandoValor && <span className="text-[10px] text-slate-400 pb-2">Salvando...</span>}

          <label className="flex items-center gap-1.5 text-[10px] text-slate-500 pb-2 ml-auto">
            <input
              type="checkbox"
              disabled={!podeContrato}
              checked={!!ficha?.sem_custo_apurado}
              onChange={alternarSemCusto}
            />
            <span title="Projeto sem apropriação de dias — fica fora das médias de margem">
              Sem custo apurado
            </span>
          </label>
        </div>

        {ficha?.sem_custo_apurado && (
          <p className="text-[10px] text-amber-700 mt-1.5">
            Este projeto não tem dias de trabalho lançados, então a margem abaixo não é confiável.
            Ele entra no faturamento, mas fica fora das médias de margem.
          </p>
        )}
      </div>

      )}

      {/* ---------- Resultado ---------- */}
      {veContrato && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Caixa titulo="Contrato" valor={reais(valorContrato)} />
        <Caixa
          titulo="Custo apurado"
          valor={reais(custoTotal)}
          ajuda={`${horasLegiveis(horasApropriadas)} de mão de obra (${reais(custoMaoDeObra)}) + despesas ${reais(totalDespesas)}`}
        />
        <Caixa
          titulo="Margem de contribuição"
          valor={reais(margemContratada)}
          destaque={margemContratada >= 0 ? 'bom' : 'ruim'}
          ajuda={valorContrato ? pct(margemContratada / valorContrato) + ' do contrato' : undefined}
        />
        <Caixa
          titulo="Já recebido"
          valor={reais(recebido)}
          ajuda={aReceber > 0 ? `Falta ${reais(aReceber)}` : 'Tudo recebido'}
        />
      </div>
      )}

      <p className="text-[10px] text-slate-400">
        <b>Margem de contribuição</b>, e não lucro: é o que sobrou depois da mão de obra e das
        despesas deste projeto, mas <b>antes</b> do custo fixo do escritório (aluguel, software,
        contador, pró-labore).
        {recebido > 0 && recebido < valorContrato && (
          <>
            {' '}
            Considerando só o que já entrou, a margem realizada é{' '}
            <b className={margemRealizada >= 0 ? 'text-slate-600' : 'text-red-600'}>
              {reais(margemRealizada)}
            </b>
            .
          </>
        )}
      </p>

      {horasEstimadas > 0 && (
        <p className="text-[10px] text-amber-700">
          {horasLegiveis(horasEstimadas)} das {horasLegiveis(horasApropriadas)} vieram do
          preenchimento automático (jornada dividida entre os projetos do dia), não do que a pessoa
          informou. Serve de ordem de grandeza, não de número fechado.
        </p>
      )}

      {diasSemCusto.length > 0 && (
        <p className="text-[10px] text-amber-700">
          Sem custo cadastrado para {diasSemCusto.join(', ')} — os dias dessas pessoas ficaram de
          fora, então o custo acima está subestimado.
        </p>
      )}

      {/* ---------- Renovacao do ano ---------- */}
      {veContrato && renovaAnual && (
        <div className="border border-emerald-200 bg-emerald-50/40 rounded-lg p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-xs font-semibold text-slate-700">Renovacao do ano</h4>
            <span className="text-[10px] text-slate-500">
              Servico que renova a cada {projeto?.renovacao_meses} meses
            </span>
            {!formRenovacao && (
              <button
                onClick={abrirRenovacao}
                className="ml-auto text-[10px] text-emerald-700 font-medium hover:underline"
              >
                + lancar recebimento da renovacao
              </button>
            )}
          </div>

          {formRenovacao && (
            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
              <label className="text-[10px] text-slate-500">
                Ano
                <input
                  value={formRenovacao.ano}
                  onChange={(e) => setFormRenovacao({ ...formRenovacao, ano: e.target.value })}
                  className="w-full border border-slate-200 rounded px-2 py-1 text-xs bg-white"
                />
              </label>
              <label className="text-[10px] text-slate-500">
                Valor
                <input
                  value={formRenovacao.valor}
                  onChange={(e) => setFormRenovacao({ ...formRenovacao, valor: e.target.value })}
                  placeholder="0,00"
                  className="w-full border border-slate-200 rounded px-2 py-1 text-xs bg-white"
                />
              </label>
              <label className="text-[10px] text-slate-500">
                Previsao
                <input
                  type="date"
                  value={formRenovacao.previsao}
                  onChange={(e) => setFormRenovacao({ ...formRenovacao, previsao: e.target.value })}
                  className="w-full border border-slate-200 rounded px-2 py-1 text-xs bg-white"
                />
              </label>
              <div className="text-[10px] text-slate-500">
                <label className="flex items-center gap-1.5 mb-1">
                  <input
                    type="checkbox"
                    checked={formRenovacao.recebido}
                    onChange={(e) =>
                      setFormRenovacao({ ...formRenovacao, recebido: e.target.checked })
                    }
                  />
                  ja recebi
                </label>
                {formRenovacao.recebido && (
                  <input
                    type="date"
                    value={formRenovacao.dataRecebimento}
                    onChange={(e) =>
                      setFormRenovacao({ ...formRenovacao, dataRecebimento: e.target.value })
                    }
                    className="w-full border border-slate-200 rounded px-2 py-1 text-xs bg-white"
                  />
                )}
              </div>
              <div className="col-span-2 md:col-span-4 flex gap-3">
                <button
                  onClick={salvarRenovacao}
                  className="px-3 py-1 rounded-md bg-emerald-600 text-white text-[11px] hover:bg-emerald-700"
                >
                  Lancar
                </button>
                <button
                  onClick={() => setFormRenovacao(null)}
                  className="text-[11px] text-slate-500 hover:text-slate-700"
                >
                  cancelar
                </button>
                <span className="text-[10px] text-slate-500 self-center">
                  Entra como parcela deste cartao e aparece no fluxo de caixa.
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------- Parcelas ---------- */}
      {veContrato && (
      <div className="border border-slate-200 rounded-lg p-3">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h4 className="text-xs font-semibold text-slate-700">Parcelas</h4>
          <button
            onClick={aplicarPadrao}
            className="text-[10px] text-indigo-600 hover:underline"
            title="Entrada 30%, Protocolo 30%, Aprovação 40%"
          >
            usar o padrão 30/30/40
          </button>
          <button onClick={adicionarParcela} className="text-[10px] text-slate-500 hover:text-indigo-600">
            + parcela
          </button>
          <label className="flex items-center gap-1 text-[10px] text-slate-500">
            em
            <input
              value={vezes}
              onChange={(e) => setVezes(e.target.value.replace(/\D/g, ''))}
              placeholder="5"
              className="w-8 border border-slate-200 rounded px-1 py-0.5 text-[10px] text-center"
            />
            x todo dia
            <input
              value={diaDoMes}
              onChange={(e) => setDiaDoMes(e.target.value.replace(/\D/g, ''))}
              className="w-8 border border-slate-200 rounded px-1 py-0.5 text-[10px] text-center"
            />
            <button
              onClick={parcelarEmVezes}
              disabled={!vezes || !valorContrato}
              className="text-[10px] text-indigo-600 hover:underline disabled:text-slate-300"
              title="Divide o valor do contrato e ja lanca as datas, mes a mes"
            >
              parcelar
            </button>
            {!!vezes && !!valorContrato && (
              <span className="text-[10px] text-slate-400">
                {vezes}x de {reais(valorContrato / (Number(vezes) || 1))}
              </span>
            )}
          </label>
          <label className="flex items-center gap-1 text-[10px] text-slate-500">
            parcelado a partir de
            <input
              type="date"
              value={inicioMensal}
              onChange={(e) => setInicioMensal(e.target.value)}
              className="border border-slate-200 rounded px-1 py-0.5 text-[10px]"
            />
            <button
              onClick={datarMensalmente}
              disabled={!inicioMensal}
              className="text-[10px] text-indigo-600 hover:underline disabled:text-slate-300"
              title="Preenche a previsao das parcelas em aberto que estao sem data, de mes em mes"
            >
              datar de mes em mes
            </button>
          </label>
          {somaParcelas > 0 && Math.abs(somaParcelas - valorContrato) > 0.01 && (
            <span className="text-[10px] text-amber-700 ml-auto">
              As parcelas somam {reais(somaParcelas)}, o contrato é {reais(valorContrato)}.
            </span>
          )}
        </div>

        {parcelas.length === 0 ? (
          <p className="text-[11px] text-slate-400 py-1">
            Nenhuma parcela. Cadastre o valor e clique em "usar o padrão 30/30/40".
          </p>
        ) : (
          <div className="space-y-1.5">
            {parcelas.map((p) => {
              const gatilhoEm = liberadaEm(p)
              const liberada = !!gatilhoEm && !p.data_recebimento
              return (
                <div
                  key={p.id}
                  className={`flex flex-wrap items-center gap-2 border rounded-md px-2 py-1.5 ${
                    p.data_recebimento
                      ? 'border-emerald-200 bg-emerald-50/50'
                      : liberada
                        ? 'border-amber-300 bg-amber-50/60'
                        : 'border-slate-200'
                  }`}
                >
                  <input
                    value={p.descricao}
                    onChange={(e) => atualizarParcela(p.id, { descricao: e.target.value })}
                    className="w-28 border border-slate-200 rounded px-1.5 py-1 text-[11px]"
                  />
                  <select
                    value={p.gatilho}
                    onChange={(e) => atualizarParcela(p.id, { gatilho: e.target.value as Gatilho })}
                    className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white"
                  >
                    {GATILHOS.map((g) => (
                      <option key={g.valor} value={g.valor}>
                        {g.rotulo}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    value={p.valor}
                    onChange={(e) => atualizarParcela(p.id, { valor: Number(e.target.value) })}
                    className="w-24 border border-slate-200 rounded px-1.5 py-1 text-[11px] text-right tabular-nums"
                  />
                  {p.percentual !== null && (
                    <span className="text-[10px] text-slate-400">
                      {Number(p.percentual).toFixed(0)}%
                    </span>
                  )}

                  {liberada && (
                    <span className="text-[10px] font-semibold text-amber-800">
                      ⏰ liberada em {formatarData(gatilhoEm)}
                    </span>
                  )}
                  {!gatilhoEm && !p.data_recebimento && (
                    <span className="text-[10px] text-slate-400">
                      aguardando {rotuloDoGatilho(p.gatilho).toLowerCase()}
                      {previstaEm(p) && (
                        <span className="text-cobre-700">
                          {' '}· previsto para {formatarData(previstaEm(p))}
                        </span>
                      )}
                    </span>
                  )}

                  <label className="flex items-center gap-1 text-[10px] text-slate-500 ml-auto">
                    previsto para
                    <input
                      type="date"
                      value={p.data_prevista || ''}
                      onChange={(e) =>
                        atualizarParcela(p.id, { data_prevista: e.target.value || null })
                      }
                      className="border border-slate-200 rounded px-1 py-0.5 text-[10px]"
                      title="Data combinada com o cliente. Em branco, o fluxo de caixa usa o planejamento do projeto."
                    />
                  </label>

                  <label className="flex items-center gap-1 text-[10px] text-slate-500">
                    recebida em
                    <input
                      type="date"
                      value={p.data_recebimento || ''}
                      onChange={(e) =>
                        atualizarParcela(p.id, { data_recebimento: e.target.value || null })
                      }
                      className="border border-slate-200 rounded px-1 py-0.5"
                    />
                  </label>
                  <button
                    onClick={() => excluirParcela(p)}
                    className="text-slate-300 hover:text-red-500 px-1"
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      )}

      {/* ---------- Despesas diretas ---------- */}
      <div className="border border-slate-200 rounded-lg p-3">
        <h4 className="text-xs font-semibold text-slate-700 mb-2">
          Despesas diretas
          {totalDespesas > 0 && (
            <span className="ml-2 font-normal text-slate-500">{reais(totalDespesas)}</span>
          )}
        </h4>

        {despesas.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-2 text-[11px] border-b border-slate-100 py-1 last:border-0"
          >
            <span className="text-slate-400 tabular-nums w-16">{formatarData(d.data)}</span>
            <span className="text-slate-600 w-40 truncate">{d.categoria}</span>
            <span className="text-slate-500 flex-1 truncate">{d.descricao}</span>
            <span className="tabular-nums text-slate-700">{reais(d.valor)}</span>
            {podeDespesas && (
              <button
                onClick={() => excluirDespesa(d)}
                className="text-slate-300 hover:text-red-500 px-1"
              >
                ×
              </button>
            )}
          </div>
        ))}

        {podeDespesas && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-dashed border-slate-200">
          <input
            type="date"
            value={novaDespesa.data}
            onChange={(e) => setNovaDespesa((d) => ({ ...d, data: e.target.value }))}
            className="border border-slate-300 rounded px-1.5 py-1 text-[11px]"
          />
          <select
            value={novaDespesa.categoria}
            onChange={(e) => setNovaDespesa((d) => ({ ...d, categoria: e.target.value }))}
            className="border border-slate-300 rounded px-1.5 py-1 text-[11px] bg-white"
          >
            {CATEGORIAS_DESPESA.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            value={novaDespesa.descricao}
            onChange={(e) => setNovaDespesa((d) => ({ ...d, descricao: e.target.value }))}
            placeholder="Descrição"
            className="flex-1 min-w-[120px] border border-slate-300 rounded px-1.5 py-1 text-[11px]"
          />
          <input
            type="number"
            step="0.01"
            value={novaDespesa.valor}
            onChange={(e) => setNovaDespesa((d) => ({ ...d, valor: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && adicionarDespesa()}
            placeholder="0,00"
            className="w-24 border border-slate-300 rounded px-1.5 py-1 text-[11px] text-right"
          />
          <button
            onClick={adicionarDespesa}
            className="px-2.5 py-1 text-[11px] bg-slate-700 hover:bg-slate-800 text-white rounded font-medium"
          >
            Lançar
          </button>
        </div>
        )}
      </div>
    </div>
  )
}

function Caixa({
  titulo,
  valor,
  ajuda,
  destaque,
}: {
  titulo: string
  valor: string
  ajuda?: string
  destaque?: 'bom' | 'ruim'
}) {
  return (
    <div className="border border-slate-200 rounded-lg px-3 py-2">
      <p className="text-[10px] uppercase text-slate-400">{titulo}</p>
      <p
        className={`text-sm font-semibold tabular-nums ${
          destaque === 'ruim' ? 'text-red-600' : destaque === 'bom' ? 'text-emerald-700' : 'text-slate-800'
        }`}
      >
        {valor}
      </p>
      {ajuda && <p className="text-[10px] text-slate-400 leading-tight">{ajuda}</p>}
    </div>
  )
}
