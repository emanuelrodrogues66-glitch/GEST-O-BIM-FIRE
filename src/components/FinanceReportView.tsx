import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { usePermissoes } from '../lib/permissoes'
import { corDoResponsavel } from '../lib/agenda'
import { pct, reais } from '../lib/financeiro'
import type { Apuracao, LinhaFinanceira } from '../lib/relatorioFinanceiro'
import { apurar, statusDoProjeto } from '../lib/relatorioFinanceiro'
import { STATUS_COLUNAS, horasLegiveis } from '../types'

type Ordem =
  | 'margem'
  | 'margemPct'
  | 'contrato'
  | 'custo'
  | 'horas'
  | 'custoPonto'
  | 'numero'

function formatarData(d: string | null) {
  if (!d) return '—'
  const [a, m, dia] = d.split('-')
  return `${dia}/${m}/${a}`
}

function mesDe(d: string | null): string | null {
  return d ? d.slice(0, 7) : null
}

function rotuloMes(ym: string): string {
  const [a, m] = ym.split('-')
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${nomes[Number(m) - 1]}/${a.slice(2)}`
}

/**
 * Relatório financeiro dos projetos.
 *
 * Só o ADM chega aqui — e o bloqueio real está nas políticas do banco: sem
 * permissão, as tabelas de valor e custo voltam vazias, não é a tela que
 * esconde.
 */
export default function FinanceReportView({
  onProjectClick,
}: {
  onProjectClick?: (projectId: string) => void
}) {
  const { pode, carregando: carregandoPerfil } = usePermissoes()
  const ehAdmin = pode('fin.relatorio.ver')
  const [dados, setDados] = useState<Apuracao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  // --- Filtros ---
  const [mes, setMes] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [status, setStatus] = useState('')
  const [tipo, setTipo] = useState('')
  const [soComValor, setSoComValor] = useState(true)
  const [ocultarSemCusto, setOcultarSemCusto] = useState(true)
  const [ordem, setOrdem] = useState<Ordem>('margem')

  useEffect(() => {
    if (ehAdmin) carregar()
    else setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ehAdmin])

  async function carregar() {
    setCarregando(true)
    setErro('')
    try {
      setDados(await apurar())
    } catch (e: any) {
      setErro(e.message || 'Não foi possível apurar.')
    } finally {
      setCarregando(false)
    }
  }

  const meses = useMemo(() => {
    if (!dados) return []
    const set = new Set<string>()
    for (const l of dados.linhas) {
      const m = mesDe(l.aprovacao)
      if (m) set.add(m)
    }
    return Array.from(set).sort().reverse()
  }, [dados])

  const responsaveis = useMemo(() => {
    if (!dados) return []
    const set = new Set<string>()
    dados.linhas.forEach((l) => l.projeto.responsavel && set.add(l.projeto.responsavel))
    return Array.from(set).sort()
  }, [dados])

  const tipos = useMemo(() => {
    if (!dados) return []
    const set = new Set<string>()
    dados.linhas.forEach((l) => l.projeto.tipo && set.add(l.projeto.tipo))
    return Array.from(set).sort()
  }, [dados])

  const filtradas = useMemo(() => {
    if (!dados) return []
    return dados.linhas.filter((l) => {
      if (soComValor && l.valorContrato <= 0) return false
      if (ocultarSemCusto && l.semCustoApurado) return false
      if (mes && mesDe(l.aprovacao) !== mes) return false
      if (responsavel && l.projeto.responsavel !== responsavel) return false
      if (status && statusDoProjeto(l) !== status) return false
      if (tipo && l.projeto.tipo !== tipo) return false
      return true
    })
  }, [dados, soComValor, ocultarSemCusto, mes, responsavel, status, tipo])

  const ordenadas = useMemo(() => {
    const chave = (l: LinhaFinanceira) => {
      switch (ordem) {
        case 'margemPct':
          return l.margemPct ?? -Infinity
        case 'contrato':
          return l.valorContrato
        case 'custo':
          return l.custoTotal
        case 'horas':
          return l.horas
        case 'custoPonto':
          return l.custoPorPonto ?? -Infinity
        case 'numero':
          return -(l.projeto.numero ?? 9999)
        default:
          return l.margem
      }
    }
    return [...filtradas].sort((a, b) => chave(b) - chave(a))
  }, [filtradas, ordem])

  const totais = useMemo(() => {
    const t = {
      contrato: 0,
      recebido: 0,
      aReceber: 0,
      custo: 0,
      maoDeObra: 0,
      despesas: 0,
      horas: 0,
      horasEstimadas: 0,
      pontos: 0,
    }
    for (const l of filtradas) {
      t.contrato += l.valorContrato
      t.recebido += l.recebido
      t.aReceber += l.aReceber
      t.custo += l.custoTotal
      t.maoDeObra += l.custoMaoDeObra
      t.despesas += l.despesas
      t.horas += l.horas
      t.horasEstimadas += l.horasEstimadas
      t.pontos += Number(l.projeto.pts) || 0
    }
    return t
  }, [filtradas])

  const margemTotal = totais.contrato - totais.custo
  const margemPctTotal = totais.contrato > 0 ? margemTotal / totais.contrato : null

  /** Top 12 por margem — os dois extremos são o que interessa olhar. */
  const dadosGrafico = useMemo(
    () =>
      ordenadas.slice(0, 12).map((l) => ({
        nome: `${l.projeto.numero ? `${l.projeto.numero} · ` : ''}${l.projeto.nome}`.slice(0, 26),
        contrato: Number(l.valorContrato.toFixed(2)),
        custo: Number(l.custoTotal.toFixed(2)),
        margem: Number(l.margem.toFixed(2)),
      })),
    [ordenadas]
  )

  /** Custo de mão de obra por pessoa, no recorte filtrado. */
  const porPessoa = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const l of filtradas) {
      for (const [nome, h] of Object.entries(l.horasPorPessoa)) {
        mapa.set(nome, (mapa.get(nome) || 0) + h)
      }
    }
    return Array.from(mapa.entries())
      .map(([nome, horas]) => ({ nome, horas: Number(horas.toFixed(1)) }))
      .sort((a, b) => b.horas - a.horas)
  }, [filtradas])

  /** Receita e custo por mês de aprovação. */
  const porMes = useMemo(() => {
    const mapa = new Map<string, { contrato: number; custo: number }>()
    for (const l of filtradas) {
      const m = mesDe(l.aprovacao)
      if (!m) continue
      if (!mapa.has(m)) mapa.set(m, { contrato: 0, custo: 0 })
      const linha = mapa.get(m)!
      linha.contrato += l.valorContrato
      linha.custo += l.custoTotal
    }
    return Array.from(mapa.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([m, v]) => ({
        mes: rotuloMes(m),
        contrato: Number(v.contrato.toFixed(2)),
        custo: Number(v.custo.toFixed(2)),
        margem: Number((v.contrato - v.custo).toFixed(2)),
      }))
  }, [filtradas])

  if (carregandoPerfil || carregando) {
    return <p className="text-sm text-slate-400 text-center py-10">Apurando...</p>
  }

  if (!ehAdmin) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <p className="text-3xl mb-2">🔒</p>
        <p className="text-sm font-medium text-slate-700">Área restrita</p>
        <p className="text-xs text-slate-500 mt-1">
          O relatório financeiro só é visível para o administrador.
        </p>
      </div>
    )
  }

  if (erro) return <p className="text-sm text-red-600 py-6">{erro}</p>
  if (!dados) return null

  return (
    <div className="space-y-4">
      {/* ---------- Filtros ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-2">
        <select
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white"
          title="Mês da aprovação do projeto"
        >
          <option value="">Todos os meses</option>
          {meses.map((m) => (
            <option key={m} value={m}>
              Aprovados em {rotuloMes(m)}
            </option>
          ))}
        </select>

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

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white"
        >
          <option value="">Todos os status</option>
          {STATUS_COLUNAS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white"
        >
          <option value="">Todos os tipos</option>
          {tipos.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
          <input type="checkbox" checked={soComValor} onChange={(e) => setSoComValor(e.target.checked)} />
          Só com valor cadastrado
        </label>

        <label
          className="flex items-center gap-1.5 text-[11px] text-slate-600"
          title="Projetos sem apropriação de dias distorcem a margem"
        >
          <input
            type="checkbox"
            checked={ocultarSemCusto}
            onChange={(e) => setOcultarSemCusto(e.target.checked)}
          />
          Ocultar sem custo apurado
        </label>

        <span className="ml-auto text-[11px] text-slate-500">
          {filtradas.length} projeto{filtradas.length === 1 ? '' : 's'}
        </span>
        <button onClick={carregar} className="text-[11px] text-indigo-600 hover:underline">
          recarregar
        </button>
      </div>

      {/* ---------- Indicadores ---------- */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Caixa titulo="Contratado" valor={reais(totais.contrato)} />
        <Caixa
          titulo="Custo apurado"
          valor={reais(totais.custo)}
          ajuda={`${horasLegiveis(totais.horas)} + ${reais(totais.despesas)} de despesas`}
        />
        <Caixa
          titulo="Margem de contribuição"
          valor={reais(margemTotal)}
          destaque={margemTotal >= 0 ? 'bom' : 'ruim'}
          ajuda={margemPctTotal !== null ? `${pct(margemPctTotal)} do contratado` : undefined}
        />
        <Caixa
          titulo="Recebido"
          valor={reais(totais.recebido)}
          ajuda={totais.aReceber > 0 ? `Falta ${reais(totais.aReceber)}` : 'Nada em aberto'}
        />
        <Caixa
          titulo="Custo por ponto"
          valor={totais.pontos > 0 ? reais(totais.custo / totais.pontos) : '—'}
          ajuda={totais.pontos > 0 ? `${totais.pontos} pts entregues` : 'Sem pontos no recorte'}
        />
      </div>

      <p className="text-[10px] text-slate-400">
        <b>Margem de contribuição</b>, não lucro: falta descontar o custo fixo do escritório
        (aluguel, software, contador, pró-labore).
        {dados.custoNaoAlocado > 0 && (
          <>
            {' '}
            Fora disto, <b>{horasLegiveis(dados.horasNaoAlocadas)}</b> em tarefas gerais custaram{' '}
            <b>{reais(dados.custoNaoAlocado)}</b> e não pertencem a projeto nenhum.
          </>
        )}
      </p>

      {/* ---------- Avisos que afetam a confiança do número ---------- */}
      {(dados.encargosEmBranco || dados.semCustoCadastrado.length > 0 || totais.horasEstimadas > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
          {dados.encargosEmBranco && (
            <p className="text-[11px] text-amber-900">
              <b>Encargos em branco.</b> O custo cadastrado é o salário puro. Se for CLT, o custo real
              é uns 70–80% maior — a margem acima está otimista.
            </p>
          )}
          {dados.semCustoCadastrado.length > 0 && (
            <p className="text-[11px] text-amber-900">
              <b>Sem custo cadastrado:</b> {dados.semCustoCadastrado.join(', ')}. As horas dessas
              pessoas ficam de fora da conta.
            </p>
          )}
          {totais.horasEstimadas > 0 && (
            <p className="text-[11px] text-amber-900">
              <b>{horasLegiveis(totais.horasEstimadas)}</b> de {horasLegiveis(totais.horas)} vieram do
              preenchimento automático, não do que a pessoa informou.
            </p>
          )}
        </div>
      )}

      {/* ---------- Parcelas liberadas ---------- */}
      {dados.aCobrar.length > 0 && (
        <div className="bg-white border border-emerald-300 rounded-xl p-3">
          <h3 className="text-sm font-semibold text-emerald-900 mb-1">
            ⏰ {dados.aCobrar.length} parcela{dados.aCobrar.length === 1 ? '' : 's'} liberada
            {dados.aCobrar.length === 1 ? '' : 's'} para cobrança —{' '}
            {reais(dados.aCobrar.reduce((s, p) => s + p.valor, 0))}
          </h3>
          <p className="text-[10px] text-slate-500 mb-2">
            O gatilho já aconteceu e o recebimento não foi registrado.
          </p>
          <div className="space-y-1">
            {dados.aCobrar.map((p, i) => (
              <button
                key={i}
                onClick={() => onProjectClick?.(p.projectId)}
                className="w-full flex flex-wrap items-center gap-2 text-[11px] text-left px-2 py-1 rounded hover:bg-emerald-50"
              >
                <span className="text-slate-400 tabular-nums w-16">{formatarData(p.liberadaEm)}</span>
                {p.numero !== null && <span className="text-slate-400 tabular-nums">#{p.numero}</span>}
                <span className="font-medium text-slate-700 flex-1 truncate">{p.projeto}</span>
                <span className="text-slate-500">{p.descricao}</span>
                <span className="text-emerald-700 font-semibold tabular-nums">{reais(p.valor)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---------- Gráficos ---------- */}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-2">Contrato, custo e margem</h3>
          {dadosGrafico.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">Nada no recorte atual.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dadosGrafico} margin={{ left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="nome" tick={{ fontSize: 9 }} interval={0} angle={-35} textAnchor="end" height={80} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => reais(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="contrato" name="Contrato" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="custo" name="Custo" fill="#f97316" radius={[3, 3, 0, 0]} />
                <Bar dataKey="margem" name="Margem" radius={[3, 3, 0, 0]}>
                  {dadosGrafico.map((d, i) => (
                    <Cell key={i} fill={d.margem >= 0 ? '#16a34a' : '#dc2626'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-2">Horas por pessoa</h3>
          {porPessoa.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">Nenhuma hora lançada no recorte.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={porPessoa} margin={{ left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => `${v} h`} />
                <Bar dataKey="horas" name="Horas" radius={[4, 4, 0, 0]}>
                  {porPessoa.map((p, i) => (
                    <Cell key={i} fill={corDoResponsavel(p.nome)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {porMes.length > 1 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-2">Por mês de aprovação</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={porMes} margin={{ left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: any) => reais(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="contrato" name="Contratado" fill="#94a3b8" radius={[3, 3, 0, 0]} />
              <Bar dataKey="custo" name="Custo" fill="#f97316" radius={[3, 3, 0, 0]} />
              <Bar dataKey="margem" name="Margem" fill="#16a34a" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ---------- Tabela ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 overflow-x-auto">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold text-slate-800">Projeto a projeto</h3>
          <select
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as Ordem)}
            className="ml-auto text-[11px] border border-slate-300 rounded-md px-1.5 py-1 bg-white"
          >
            <option value="margem">Maior margem</option>
            <option value="margemPct">Maior margem %</option>
            <option value="contrato">Maior contrato</option>
            <option value="custo">Maior custo</option>
            <option value="horas">Mais horas</option>
            <option value="custoPonto">Maior custo por ponto</option>
            <option value="numero">Número do projeto</option>
          </select>
        </div>

        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-200">
              <th className="text-left py-1.5">Projeto</th>
              <th className="text-left">Resp.</th>
              <th className="text-right">Contrato</th>
              <th className="text-right">Custo</th>
              <th className="text-right">Margem</th>
              <th className="text-right">%</th>
              <th className="text-right">Horas</th>
              <th className="text-right">Pts</th>
              <th className="text-right">R$/pt</th>
              <th className="text-right">Recebido</th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((l) => (
              <tr
                key={l.projeto.id}
                onClick={() => onProjectClick?.(l.projeto.id)}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer"
              >
                <td className="py-1.5 max-w-[220px]">
                  <span className="text-slate-400 tabular-nums mr-1">{l.projeto.numero ?? ''}</span>
                  <span className="font-medium text-slate-800">{l.projeto.nome}</span>
                  {l.semCustoApurado && (
                    <span className="ml-1 text-[9px] text-amber-600" title="Sem apropriação de dias">
                      s/ custo
                    </span>
                  )}
                </td>
                <td>
                  {l.projeto.responsavel && (
                    <span
                      className="text-[10px] font-medium"
                      style={{ color: corDoResponsavel(l.projeto.responsavel) }}
                    >
                      {l.projeto.responsavel}
                    </span>
                  )}
                </td>
                <td className="text-right tabular-nums text-slate-600">{reais(l.valorContrato)}</td>
                <td className="text-right tabular-nums text-slate-600">{reais(l.custoTotal)}</td>
                <td
                  className={`text-right tabular-nums font-medium ${
                    l.margem >= 0 ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {reais(l.margem)}
                </td>
                <td className="text-right tabular-nums text-slate-500">{pct(l.margemPct)}</td>
                <td className="text-right tabular-nums text-slate-500">
                  {l.horas > 0 ? horasLegiveis(l.horas) : '—'}
                </td>
                <td className="text-right tabular-nums text-slate-500">{l.projeto.pts ?? '—'}</td>
                <td className="text-right tabular-nums text-slate-500">
                  {l.custoPorPonto !== null ? reais(l.custoPorPonto) : '—'}
                </td>
                <td className="text-right tabular-nums text-slate-500">
                  {l.recebido > 0 ? reais(l.recebido) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          {ordenadas.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-300 font-semibold text-slate-800">
                <td className="py-1.5" colSpan={2}>
                  Total
                </td>
                <td className="text-right tabular-nums">{reais(totais.contrato)}</td>
                <td className="text-right tabular-nums">{reais(totais.custo)}</td>
                <td
                  className={`text-right tabular-nums ${
                    margemTotal >= 0 ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {reais(margemTotal)}
                </td>
                <td className="text-right tabular-nums">{pct(margemPctTotal)}</td>
                <td className="text-right tabular-nums">{horasLegiveis(totais.horas)}</td>
                <td className="text-right tabular-nums">{totais.pontos}</td>
                <td className="text-right tabular-nums">
                  {totais.pontos > 0 ? reais(totais.custo / totais.pontos) : '—'}
                </td>
                <td className="text-right tabular-nums">{reais(totais.recebido)}</td>
              </tr>
            </tfoot>
          )}
        </table>

        {ordenadas.length === 0 && (
          <p className="text-xs text-slate-400 py-4 text-center">
            Nenhum projeto no recorte. Desmarque "Só com valor cadastrado" para ver os demais.
          </p>
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
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-3 py-2.5">
      <p className="text-[10px] uppercase text-slate-400">{titulo}</p>
      <p
        className={`text-base font-semibold tabular-nums ${
          destaque === 'ruim' ? 'text-red-600' : destaque === 'bom' ? 'text-emerald-700' : 'text-slate-800'
        }`}
      >
        {valor}
      </p>
      {ajuda && <p className="text-[10px] text-slate-400 leading-tight">{ajuda}</p>}
    </div>
  )
}
