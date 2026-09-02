import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Etapa, Lead } from '../lib/crm'
import { reais } from '../lib/crm'
import { corDoResponsavel } from '../lib/agenda'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function mesRotulo(iso: string | null): string {
  if (!iso) return '—'
  const [a, m] = iso.slice(0, 7).split('-')
  return `${MESES[Number(m) - 1]}/${a.slice(2)}`
}

/**
 * Dashboard do comercial.
 *
 * A pergunta que um funil existe para responder não é "quanto vendi" — é
 * "onde os negócios morrem". Por isso a conversão por etapa vem primeiro, e o
 * motivo da perda tem o mesmo peso do valor ganho.
 */
export default function CrmDashboard({
  leads,
  etapas,
  verComissao,
}: {
  leads: Lead[]
  etapas: Etapa[]
  verComissao: boolean
}) {
  const ganhos = useMemo(() => leads.filter((l) => l.estado === 'ganho'), [leads])
  const perdidos = useMemo(() => leads.filter((l) => l.estado === 'perdido'), [leads])
  const abertos = useMemo(() => leads.filter((l) => l.estado === 'aberta'), [leads])

  const valorGanho = ganhos.reduce((s, l) => s + (l.valor_fechado ?? l.valor ?? 0), 0)
  const valorAberto = abertos.reduce((s, l) => s + (l.valor_fechado ?? l.valor ?? 0), 0)
  const decididos = ganhos.length + perdidos.length
  const conversao = decididos ? (ganhos.length / decididos) * 100 : 0
  const ticket = ganhos.length ? valorGanho / ganhos.length : 0
  const comissao = ganhos.reduce((s, l) => s + (l.comissao_valor ?? 0), 0)

  /** Dias entre abrir e fechar — o "quanto demora para vender". */
  const cicloMedio = useMemo(() => {
    const dias = ganhos
      .filter((l) => l.data_fechamento && l.criado_em)
      .map(
        (l) =>
          (new Date(l.data_fechamento!).getTime() - new Date(l.criado_em).getTime()) / 86400000
      )
      .filter((d) => d >= 0 && d < 900)
    if (!dias.length) return null
    return Math.round(dias.reduce((s, d) => s + d, 0) / dias.length)
  }, [ganhos])

  const porMes = useMemo(() => {
    const mapa = new Map<string, { mes: string; ganho: number; valor: number; perdido: number }>()
    for (const l of leads) {
      const ref = l.estado === 'aberta' ? l.criado_em : l.data_fechamento || l.criado_em
      const k = ref.slice(0, 7)
      if (!mapa.has(k)) mapa.set(k, { mes: mesRotulo(ref), ganho: 0, valor: 0, perdido: 0 })
      const linha = mapa.get(k)!
      if (l.estado === 'ganho') {
        linha.ganho += 1
        linha.valor += l.valor_fechado ?? l.valor ?? 0
      } else if (l.estado === 'perdido') linha.perdido += 1
    }
    return Array.from(mapa.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([, v]) => v)
  }, [leads])

  const porFonte = useMemo(() => agrupar(leads, (l) => l.fonte || 'Sem fonte'), [leads])
  const porResponsavel = useMemo(
    () => agrupar(leads, (l) => l.responsavel || 'Sem responsável'),
    [leads]
  )
  const motivos = useMemo(
    () =>
      agrupar(perdidos, (l) => l.motivo_perda || 'Sem motivo').sort((a, b) => b.total - a.total),
    [perdidos]
  )

  /** Quantos negócios pararam em cada etapa — só o que está vivo. */
  const funil = useMemo(() => {
    const abertas = etapas.filter((e) => e.tipo === 'aberta').sort((a, b) => a.ordem - b.ordem)
    return abertas.map((e) => {
      const lista = abertos.filter((l) => l.stage_id === e.id)
      return {
        nome: e.nome.replace(/^[A-ZÇÃ]+-/, ''),
        cor: e.cor || '#94a3b8',
        qtd: lista.length,
        valor: lista.reduce((s, l) => s + (l.valor_fechado ?? l.valor ?? 0), 0),
      }
    })
  }, [etapas, abertos])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <Caixa titulo="Ganhos" valor={ganhos.length.toString()} rodape={reais(valorGanho)} tom="bom" />
        <Caixa titulo="Em aberto" valor={abertos.length.toString()} rodape={reais(valorAberto)} />
        <Caixa titulo="Perdidos" valor={perdidos.length.toString()} tom="ruim" />
        <Caixa titulo="Conversão" valor={`${conversao.toFixed(0)}%`} rodape={`${decididos} decididos`} />
        <Caixa titulo="Ticket médio" valor={reais(ticket)} />
        {verComissao ? (
          <Caixa titulo="Comissão" valor={reais(comissao)} rodape="sobre os ganhos" />
        ) : (
          <Caixa
            titulo="Ciclo de venda"
            valor={cicloMedio !== null ? `${cicloMedio} d` : '—'}
            rodape="da abertura ao fechamento"
          />
        )}
      </div>

      {/* ---------- funil ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        <h3 className="text-xs font-semibold text-slate-700">Onde estão os negócios abertos</h3>
        <p className="text-[10px] text-slate-400 mb-3">
          Só o que está vivo. Etapa cheia e parada é onde o funil entope.
        </p>
        <div className="space-y-1.5">
          {funil.map((f) => {
            const maior = Math.max(...funil.map((x) => x.qtd), 1)
            return (
              <div key={f.nome} className="flex items-center gap-2">
                <span className="text-[11px] text-slate-600 w-44 truncate text-right">{f.nome}</span>
                <div className="flex-1 bg-slate-100 rounded h-5 relative overflow-hidden">
                  <div
                    className="h-full rounded transition-all"
                    style={{ width: `${(f.qtd / maior) * 100}%`, background: f.cor }}
                  />
                  <span className="absolute left-2 top-0 h-5 flex items-center text-[10px] font-medium text-slate-700">
                    {f.qtd > 0 ? f.qtd : ''}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 tabular-nums w-24 text-right">
                  {f.valor > 0 ? reais(f.valor) : ''}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ---------- ao longo do tempo ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        <h3 className="text-xs font-semibold text-slate-700 mb-2">Vendas por mês</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={porMes}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="q" tick={{ fontSize: 10 }} />
            <YAxis
              yAxisId="v"
              orientation="right"
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => `${Math.round(v / 1000)}k`}
            />
            <Tooltip
              formatter={(v: any, n: any) => (n === 'valor' ? reais(Number(v)) : v)}
              contentStyle={{ fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="q" dataKey="ganho" name="ganhos" stroke="#16a34a" strokeWidth={2} />
            <Line yAxisId="q" dataKey="perdido" name="perdidos" stroke="#9f1239" strokeWidth={1} />
            <Line yAxisId="v" dataKey="valor" name="valor" stroke="#9C0000" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Ranking titulo="Por fonte" linhas={porFonte} />
        <Ranking titulo="Por responsável" linhas={porResponsavel} colorido />
      </div>

      {/* ---------- perdas ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        <h3 className="text-xs font-semibold text-slate-700">Por que se perde</h3>
        <p className="text-[10px] text-slate-400 mb-2">
          {perdidos.length} negócios perdidos. É a lista mais útil do painel: cada linha aqui é um
          processo que dá para arrumar.
        </p>
        <ResponsiveContainer width="100%" height={Math.max(140, motivos.length * 30)}>
          <BarChart data={motivos} layout="vertical" margin={{ left: 90 }}>
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="chave" tick={{ fontSize: 10 }} width={150} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Bar dataKey="total" name="negócios" radius={[0, 4, 4, 0]}>
              {motivos.map((_, i) => (
                <Cell key={i} fill="#9f1239" fillOpacity={0.85 - i * 0.08} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ---------- comissões ---------- */}
      {verComissao && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50">
            <h3 className="text-xs font-semibold text-slate-700">Comissão por responsável</h3>
            <p className="text-[10px] text-slate-400">
              Vale desde abril/2026. Até junho, Matheus tinha 5% / 2,5% e Emanuel 2,5% / 1,25%, com
              memorial acima de R$ 1.200. De julho em diante, 5% em cliente novo, 2,25% em quem já
              comprou e memorial acima de R$ 1.500 para os dois.
            </p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-200">
                <th className="text-left py-2 pl-4">Responsável</th>
                <th className="text-center">Vendas</th>
                <th className="text-center">Novos</th>
                <th className="text-center">Recompra</th>
                <th className="text-center">Memorial</th>
                <th className="text-right">Vendido</th>
                <th className="text-right pr-4">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {comissaoPorPessoa(ganhos).map((r) => (
                <tr key={r.nome} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pl-4 font-medium" style={{ color: corDoResponsavel(r.nome) }}>
                    {r.nome}
                  </td>
                  <td className="text-center tabular-nums text-slate-700">{r.vendas}</td>
                  <td className="text-center tabular-nums text-slate-500">{r.novo}</td>
                  <td className="text-center tabular-nums text-slate-500">{r.recompra}</td>
                  <td className="text-center tabular-nums text-slate-500">{r.memorial}</td>
                  <td className="text-right tabular-nums text-slate-700">{reais(r.vendido)}</td>
                  <td className="text-right pr-4 tabular-nums font-semibold text-emerald-700">
                    {reais(r.comissao)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-[10px] text-slate-400 border-t border-slate-100">
            Venda anterior a abril/2026 aparece sem comissão de propósito: a regra não valia ainda.
            "Cliente novo" é quem não tinha venda ganha nem projeto anterior no sistema — e boa
            parte do histórico do RD veio sem o nome do cliente, então esses caem em novo por falta
            de dado. Confira os valores altos antes de pagar.
          </p>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ apoio

type Linha = { chave: string; total: number; ganho: number; valor: number }

function agrupar(leads: Lead[], chaveDe: (l: Lead) => string): Linha[] {
  const mapa = new Map<string, Linha>()
  for (const l of leads) {
    const k = chaveDe(l)
    if (!mapa.has(k)) mapa.set(k, { chave: k, total: 0, ganho: 0, valor: 0 })
    const linha = mapa.get(k)!
    linha.total += 1
    if (l.estado === 'ganho') {
      linha.ganho += 1
      linha.valor += l.valor_fechado ?? l.valor ?? 0
    }
  }
  return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor || b.total - a.total)
}

function comissaoPorPessoa(ganhos: Lead[]) {
  const mapa = new Map<
    string,
    { nome: string; vendas: number; novo: number; recompra: number; memorial: number; vendido: number; comissao: number }
  >()
  for (const l of ganhos) {
    const nome = (l.responsavel || 'Sem responsável').trim()
    if (!mapa.has(nome)) {
      mapa.set(nome, { nome, vendas: 0, novo: 0, recompra: 0, memorial: 0, vendido: 0, comissao: 0 })
    }
    const r = mapa.get(nome)!
    r.vendas += 1
    r.vendido += l.valor_fechado ?? l.valor ?? 0
    r.comissao += l.comissao_valor ?? 0
    if (l.tipo_venda === 'novo') r.novo += 1
    else if (l.tipo_venda === 'recompra') r.recompra += 1
    else if (l.tipo_venda === 'memorial') r.memorial += 1
  }
  return Array.from(mapa.values()).sort((a, b) => b.comissao - a.comissao)
}

function Caixa({
  titulo,
  valor,
  rodape,
  tom,
}: {
  titulo: string
  valor: string
  rodape?: string
  tom?: 'bom' | 'ruim'
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-3 py-2.5">
      <p className="text-[10px] uppercase text-slate-400">{titulo}</p>
      <p
        className={`text-lg font-semibold tabular-nums ${
          tom === 'bom' ? 'text-emerald-700' : tom === 'ruim' ? 'text-red-700' : 'text-slate-800'
        }`}
      >
        {valor}
      </p>
      {rodape && <p className="text-[9px] text-slate-400 truncate">{rodape}</p>}
    </div>
  )
}

function Ranking({ titulo, linhas, colorido }: { titulo: string; linhas: Linha[]; colorido?: boolean }) {
  const maior = Math.max(...linhas.map((l) => l.valor), 1)
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
      <h3 className="text-xs font-semibold text-slate-700 mb-2">{titulo}</h3>
      <div className="space-y-1.5">
        {linhas.slice(0, 10).map((l) => {
          const conv = l.total ? Math.round((l.ganho / l.total) * 100) : 0
          return (
            <div key={l.chave} className="flex items-center gap-2 text-[11px]">
              <span
                className="w-32 truncate"
                style={colorido ? { color: corDoResponsavel(l.chave) } : undefined}
              >
                {l.chave}
              </span>
              <div className="flex-1 bg-slate-100 rounded h-3.5">
                <div
                  className="h-full rounded bg-indigo-600"
                  style={{ width: `${(l.valor / maior) * 100}%` }}
                />
              </div>
              <span className="tabular-nums text-slate-600 w-20 text-right">{reais(l.valor)}</span>
              <span className="tabular-nums text-slate-400 w-16 text-right">
                {l.ganho}/{l.total} · {conv}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
