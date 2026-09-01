import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePermissoes } from '../lib/permissoes'
import type { TeamCost } from '../lib/financeiro'
import { VINCULOS, custoComEncargos, custoPorDia, custoPorHora, reais, vigente } from '../lib/financeiro'

function hojeStr() {
  return new Date().toISOString().slice(0, 10)
}

function formatarData(d: string | null) {
  if (!d) return '—'
  const [a, m, dia] = d.split('-')
  return `${dia}/${m}/${a}`
}

const VAZIO = {
  colaborador: '',
  vinculo: 'CLT',
  vigencia_inicio: hojeStr().slice(0, 8) + '01',
  salario_base: '',
  encargos_pct: '',
  custo_mensal: '',
  dias_uteis_mes: '21',
  horas_por_dia: '8',
  observacao: '',
}

/**
 * Cadastro do custo de cada pessoa, com vigência.
 *
 * Nasce vazio de propósito: os valores são do escritório, não meus de adivinhar.
 *
 * A vigência é o que faz o histórico parar de pé — dar aumento não pode mudar
 * o custo dos projetos do ano passado. Ao gravar um valor novo, o banco fecha
 * sozinho a vigência anterior da mesma pessoa.
 */
export default function TeamCostsView() {
  const { pode, carregando: carregandoPerfil } = usePermissoes()
  const ehAdmin = pode('fin.salarios.ver')
  const podeEditar = pode('fin.salarios.editar')
  const [custos, setCustos] = useState<TeamCost[]>([])
  const [equipe, setEquipe] = useState<string[]>([])
  // Quem entra no ranking de pontos. Gerente entra em projeto para destravar,
  // não para competir — por isso a lista é editável, e não fixa no código.
  const [membros, setMembros] = useState<{ id: string; nome: string; pontua: boolean }[]>([])
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState({ ...VAZIO })
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (ehAdmin) carregar()
    else setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ehAdmin])

  async function carregar() {
    setCarregando(true)
    const [c, m] = await Promise.all([
      supabase.from('team_costs').select('*').order('colaborador').order('vigencia_inicio', { ascending: false }),
      supabase.from('team_members').select('id, nome, pontua').eq('ativo', true).order('ordem'),
    ])
    setCustos((c.data as TeamCost[]) || [])
    const lista = (m.data as { id: string; nome: string; pontua: boolean }[]) || []
    setMembros(lista)
    setEquipe(lista.map((x) => x.nome))
    setCarregando(false)
  }

  // Quem digita salário + encargos vê o custo cheio calculado na hora.
  const custoSugerido = useMemo(() => {
    const salario = Number(form.salario_base)
    const encargos = Number(form.encargos_pct)
    if (!salario || Number.isNaN(salario)) return null
    return custoComEncargos(salario, Number.isNaN(encargos) ? 0 : encargos)
  }, [form.salario_base, form.encargos_pct])

  function limpar() {
    setForm({ ...VAZIO })
    setEditandoId(null)
    setErro('')
  }

  function editar(c: TeamCost) {
    setEditandoId(c.id)
    setErro('')
    setForm({
      colaborador: c.colaborador,
      vinculo: c.vinculo,
      vigencia_inicio: c.vigencia_inicio,
      salario_base: c.salario_base?.toString() || '',
      encargos_pct: c.encargos_pct?.toString() || '',
      custo_mensal: c.custo_mensal.toString(),
      dias_uteis_mes: c.dias_uteis_mes.toString(),
      horas_por_dia: c.horas_por_dia?.toString() || '8',
      observacao: c.observacao || '',
    })
  }

  async function salvar() {
    setErro('')
    if (!form.colaborador.trim()) return setErro('Escolha de quem é este custo.')

    // Sem custo digitado, vale o que saiu de salário + encargos.
    const custo = Number(form.custo_mensal) || custoSugerido
    if (!custo || custo <= 0) {
      return setErro('Informe o custo mensal, ou o salário e o percentual de encargos.')
    }

    setSalvando(true)
    const payload = {
      colaborador: form.colaborador.trim(),
      vinculo: form.vinculo,
      vigencia_inicio: form.vigencia_inicio,
      salario_base: form.salario_base ? Number(form.salario_base) : null,
      encargos_pct: form.encargos_pct ? Number(form.encargos_pct) : null,
      custo_mensal: custo,
      dias_uteis_mes: Number(form.dias_uteis_mes) || 21,
      horas_por_dia: Number(form.horas_por_dia) || 8,
      observacao: form.observacao.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const { error } = editandoId
      ? await supabase.from('team_costs').update(payload).eq('id', editandoId)
      : await supabase.from('team_costs').insert(payload)

    setSalvando(false)
    if (error) {
      setErro(
        error.message.includes('team_costs_colaborador_vigencia_inicio_key')
          ? 'Já existe um custo dessa pessoa começando nessa data. Edite aquele registro.'
          : error.message
      )
      return
    }
    limpar()
    carregar()
  }

  async function alternarPontuacao(m: { id: string; nome: string; pontua: boolean }) {
    const { error } = await supabase
      .from('team_members')
      .update({ pontua: !m.pontua })
      .eq('id', m.id)
    if (error) {
      setErro(error.message)
      return
    }
    carregar()
  }

  async function excluir(c: TeamCost) {
    if (!confirm(`Apagar o custo de ${c.colaborador} a partir de ${formatarData(c.vigencia_inicio)}?`)) return
    await supabase.from('team_costs').delete().eq('id', c.id)
    carregar()
  }

  if (carregandoPerfil || carregando) {
    return <p className="text-sm text-slate-400 text-center py-10">Carregando...</p>
  }

  if (!ehAdmin) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <p className="text-3xl mb-2">🔒</p>
        <p className="text-sm font-medium text-slate-700">Área restrita</p>
        <p className="text-xs text-slate-500 mt-1">
          Os dados de custo e remuneração só são visíveis para o administrador.
        </p>
      </div>
    )
  }

  // Uma linha por pessoa vigente hoje; o resto é histórico.
  const vigentes = custos.filter((c) => vigente(c))
  const historico = custos.filter((c) => !vigente(c))
  const folhaMensal = vigentes.reduce((s, c) => s + Number(c.custo_mensal), 0)
  const semCusto = equipe.filter(
    (n) => !vigentes.some((c) => c.colaborador.trim().toLowerCase() === n.trim().toLowerCase())
  )

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <p className="text-xs text-amber-900">
          <b>Visível só para você.</b> O bloqueio está no banco de dados, não só na tela — mesmo quem
          usa o login compartilhado não consegue ler estes valores por nenhum caminho.
        </p>
      </div>

      {/* ---------- Formulário ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">
          {editandoId ? 'Editar custo' : 'Novo custo'}
        </h3>

        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-slate-500">Colaborador</span>
            <input
              list="equipe-custos"
              value={form.colaborador}
              onChange={(e) => setForm((f) => ({ ...f, colaborador: e.target.value }))}
              placeholder="Nome"
              className="w-40 border border-slate-300 rounded-md px-2 py-1.5 text-xs"
            />
          </label>
          <datalist id="equipe-custos">
            {equipe.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-slate-500">Vínculo</span>
            <select
              value={form.vinculo}
              onChange={(e) => setForm((f) => ({ ...f, vinculo: e.target.value }))}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-xs bg-white"
            >
              {VINCULOS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-slate-500">Vale a partir de</span>
            <input
              type="date"
              value={form.vigencia_inicio}
              onChange={(e) => setForm((f) => ({ ...f, vigencia_inicio: e.target.value }))}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-xs"
              title="Aumento entra como um registro novo; o anterior fecha sozinho"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-slate-500">Dias úteis/mês</span>
            <input
              type="number"
              min={1}
              max={31}
              step="0.5"
              value={form.dias_uteis_mes}
              onChange={(e) => setForm((f) => ({ ...f, dias_uteis_mes: e.target.value }))}
              className="w-24 border border-slate-300 rounded-md px-2 py-1.5 text-xs"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-slate-500">Horas/dia</span>
            <input
              type="number"
              min={1}
              max={24}
              step="0.5"
              value={form.horas_por_dia}
              onChange={(e) => setForm((f) => ({ ...f, horas_por_dia: e.target.value }))}
              title="Jornada diária. Divide o custo do dia para chegar ao custo por hora."
              className="w-20 border border-slate-300 rounded-md px-2 py-1.5 text-xs"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-slate-500">Salário base (R$)</span>
            <input
              type="number"
              step="0.01"
              value={form.salario_base}
              onChange={(e) => setForm((f) => ({ ...f, salario_base: e.target.value }))}
              placeholder="0,00"
              className="w-32 border border-slate-300 rounded-md px-2 py-1.5 text-xs"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-slate-500">Encargos (%)</span>
            <input
              type="number"
              step="0.1"
              value={form.encargos_pct}
              onChange={(e) => setForm((f) => ({ ...f, encargos_pct: e.target.value }))}
              placeholder="ex. 78"
              title="FGTS, INSS patronal, 13º, férias + 1/3, provisões"
              className="w-24 border border-slate-300 rounded-md px-2 py-1.5 text-xs"
            />
          </label>

          <span className="text-slate-300 pb-2">→</span>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-slate-500">Custo mensal (R$)</span>
            <input
              type="number"
              step="0.01"
              value={form.custo_mensal}
              onChange={(e) => setForm((f) => ({ ...f, custo_mensal: e.target.value }))}
              placeholder={custoSugerido ? custoSugerido.toFixed(2) : '0,00'}
              title="É este valor que entra na conta do projeto"
              className="w-36 border border-indigo-300 rounded-md px-2 py-1.5 text-xs font-medium"
            />
          </label>

          {custoSugerido !== null && !form.custo_mensal && (
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, custo_mensal: custoSugerido.toFixed(2) }))}
              className="text-[10px] text-indigo-600 hover:underline pb-2"
            >
              usar {reais(custoSugerido)}
            </button>
          )}
        </div>

        <p className="text-[10px] text-slate-400">
          O salário e os encargos ficam só como referência de como você chegou ao número. Quem já
          recebe o custo cheio do contador pode preencher direto o custo mensal.
          {(Number(form.custo_mensal) || custoSugerido) && (
            <>
              {' '}
              Dá{' '}
              <b className="text-slate-600">
                {reais(
                  (Number(form.custo_mensal) || custoSugerido || 0) / (Number(form.dias_uteis_mes) || 21)
                )}
              </b>{' '}
              por dia de trabalho.
            </>
          )}
        </p>

        <input
          value={form.observacao}
          onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
          placeholder="Observação (opcional)"
          className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
        />

        {erro && <p className="text-xs text-red-600">{erro}</p>}

        <div className="flex justify-end gap-2">
          {editandoId && (
            <button onClick={limpar} className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-md">
              Cancelar
            </button>
          )}
          <button
            onClick={salvar}
            disabled={salvando || !podeEditar}
            title={podeEditar ? undefined : 'Seu perfil vê os custos, mas não altera.'}
            className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md font-medium"
          >
            {salvando ? 'Salvando...' : editandoId ? 'Salvar' : 'Cadastrar'}
          </button>
        </div>
      </div>

      {/* ---------- Vigentes ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-800">Custo vigente</h3>
          {vigentes.length > 0 && (
            <span className="text-xs text-slate-500">
              Folha mensal: <b className="text-slate-800">{reais(folhaMensal)}</b>
            </span>
          )}
        </div>

        {vigentes.length === 0 ? (
          <p className="text-xs text-slate-400 py-3">
            Nenhum custo cadastrado ainda. Preencha o formulário acima para começar.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-200">
                <th className="text-left py-1.5">Colaborador</th>
                <th className="text-left">Vínculo</th>
                <th className="text-right">Custo mensal</th>
                <th className="text-right">Por dia</th>
                <th className="text-left pl-3">Desde</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {vigentes.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 font-medium text-slate-800">{c.colaborador}</td>
                  <td className="text-slate-500">{c.vinculo}</td>
                  <td className="text-right tabular-nums text-slate-700">{reais(c.custo_mensal)}</td>
                  <td className="text-right tabular-nums text-slate-500">{reais(custoPorDia(c))}</td>
                  <td className="text-right tabular-nums text-slate-500">{reais(custoPorHora(c))}</td>
                  <td className="pl-3 text-slate-400 tabular-nums">{formatarData(c.vigencia_inicio)}</td>
                  <td className="text-right whitespace-nowrap">
                    <button
                      onClick={() => editar(c)}
                      className="text-slate-300 hover:text-indigo-600 px-1"
                      title="Editar"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => excluir(c)}
                      className="text-slate-300 hover:text-red-500 px-1"
                      title="Apagar"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {semCusto.length > 0 && (
          <p className="text-[10px] text-amber-700 mt-2">
            Sem custo cadastrado: {semCusto.join(', ')}. Os dias dessas pessoas ficam de fora da conta
            até você preencher.
          </p>
        )}
      </div>

      {/* ---------- Quem disputa pontos ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-1">Quem disputa pontos</h3>
        <p className="text-[10px] text-slate-400 mb-3">
          Quem gerencia entra em projeto para destravar ou revisar. Se pontuasse, apareceria no
          ranking competindo com quem projeta — e ainda tiraria fatia deles na divisão. As horas de
          quem está desmarcado continuam contando no custo, só não viram ponto.
        </p>
        <div className="flex flex-wrap gap-2">
          {membros.map((m) => (
            <button
              key={m.id}
              onClick={() => alternarPontuacao(m)}
              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border transition ${
                m.pontua
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-medium'
                  : 'bg-slate-50 border-slate-300 text-slate-500'
              }`}
            >
              <input type="checkbox" checked={m.pontua} readOnly className="pointer-events-none" />
              {m.nome}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Histórico ---------- */}
      {historico.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Histórico</h3>
          <p className="text-[10px] text-slate-400 mb-2">
            Valores encerrados. Continuam valendo para os dias em que estavam vigentes — por isso o
            custo dos projetos antigos não muda quando alguém recebe aumento.
          </p>
          <table className="w-full text-xs">
            <tbody>
              {historico.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 text-slate-500">
                  <td className="py-1.5">{c.colaborador}</td>
                  <td className="tabular-nums">
                    {formatarData(c.vigencia_inicio)} a {formatarData(c.vigencia_fim)}
                  </td>
                  <td className="text-right tabular-nums">{reais(c.custo_mensal)}</td>
                  <td className="text-right">
                    <button
                      onClick={() => excluir(c)}
                      className="text-slate-300 hover:text-red-500 px-1"
                      title="Apagar"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
