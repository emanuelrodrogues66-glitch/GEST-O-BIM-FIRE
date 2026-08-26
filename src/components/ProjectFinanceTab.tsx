import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePerfil } from '../lib/perfil'
import type { Gatilho, ProjectExpense, ProjectFinance, ProjectInstallment, TeamCost } from '../lib/financeiro'
import {
  CATEGORIAS_DESPESA,
  GATILHOS,
  PARCELAMENTO_PADRAO,
  custoNaData,
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
  const { ehAdmin, carregando: carregandoPerfil } = usePerfil()

  const [ficha, setFicha] = useState<ProjectFinance | null>(null)
  const [parcelas, setParcelas] = useState<ProjectInstallment[]>([])
  const [despesas, setDespesas] = useState<ProjectExpense[]>([])
  const [datas, setDatas] = useState<DatasDoProjeto>({
    data_contrato: null,
    data_protocolo: null,
    data_aprovacao: null,
  })
  const [custoMaoDeObra, setCustoMaoDeObra] = useState(0)
  const [diasSemCusto, setDiasSemCusto] = useState<string[]>([])
  const [carregando, setCarregando] = useState(true)

  const [valor, setValor] = useState('')
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

  async function carregar() {
    setCarregando(true)
    const [f, p, d, cliente, custos] = await Promise.all([
      supabase.from('project_finance').select('*').eq('project_id', projectId).maybeSingle(),
      supabase.from('project_installments').select('*').eq('project_id', projectId).order('ordem'),
      supabase.from('project_expenses').select('*').eq('project_id', projectId).order('data'),
      supabase
        .from('project_clients')
        .select('data_contrato, data_protocolo, data_aprovacao')
        .eq('project_id', projectId)
        .maybeSingle(),
      supabase.from('team_costs').select('*'),
    ])

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
    const { data } = await supabase.from('project_activities').select('responsavel, data, project_id')
    const linhas = (data as { responsavel: string; data: string; project_id: string }[]) || []

    // Quantos projetos cada pessoa tocou em cada dia — é o divisor do dia.
    const projetosNoDia = new Map<string, number>()
    for (const l of linhas) {
      const chave = `${l.responsavel.trim().toLowerCase()}|${l.data}`
      projetosNoDia.set(chave, (projetosNoDia.get(chave) || 0) + 1)
    }

    let total = 0
    const faltando = new Set<string>()
    for (const l of linhas) {
      if (l.project_id !== projectId) continue
      const divisor = projetosNoDia.get(`${l.responsavel.trim().toLowerCase()}|${l.data}`) || 1
      const diaria = custoNaData(custos, l.responsavel, l.data)
      if (diaria === null) {
        faltando.add(l.responsavel)
        continue
      }
      total += diaria / divisor
    }
    setCustoMaoDeObra(total)
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
      <div className="border border-slate-200 rounded-lg p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-slate-500">Valor do contrato (R$)</span>
            <input
              type="number"
              step="0.01"
              value={valor}
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

      {/* ---------- Resultado ---------- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Caixa titulo="Contrato" valor={reais(valorContrato)} />
        <Caixa
          titulo="Custo apurado"
          valor={reais(custoTotal)}
          ajuda={`Mão de obra ${reais(custoMaoDeObra)} + despesas ${reais(totalDespesas)}`}
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

      {diasSemCusto.length > 0 && (
        <p className="text-[10px] text-amber-700">
          Sem custo cadastrado para {diasSemCusto.join(', ')} — os dias dessas pessoas ficaram de
          fora, então o custo acima está subestimado.
        </p>
      )}

      {/* ---------- Parcelas ---------- */}
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
                    </span>
                  )}

                  <label className="flex items-center gap-1 text-[10px] text-slate-500 ml-auto">
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
            <button onClick={() => excluirDespesa(d)} className="text-slate-300 hover:text-red-500 px-1">
              ×
            </button>
          </div>
        ))}

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
