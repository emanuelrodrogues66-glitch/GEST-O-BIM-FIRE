import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Ligacao, ResumoLigacoes } from '../lib/ligacoes'
import CrmLigacoesCampanha from './CrmLigacoesCampanha'
import {
  RESULTADOS,
  carregarLigacoes,
  corDoResultado,
  duracaoBonita,
  resumoLigacoes,
  rotuloDoResultado,
} from '../lib/ligacoes'

function hoje() {
  return new Date().toISOString().slice(0, 10)
}
function diasAtras(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
function diaBonito(iso: string) {
  const [, m, d] = iso.slice(0, 10).split('-')
  return d + '/' + m
}
function quandoBonito(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

/**
 * Relatorio de ligacoes.
 *
 * A pergunta que ele responde nao e "quantas ligacoes fizemos" — e "quantas
 * viraram conversa". Por isso atendidas e taxa de atendimento vem antes do
 * total, e o detalhe por pessoa mostra quem liga e quem conversa.
 */
export default function CrmLigacoes({ onAbrirLead }: { onAbrirLead?: (id: string) => void }) {
  const [de, setDe] = useState(diasAtras(30))
  const [ate, setAte] = useState(hoje())
  const [quem, setQuem] = useState('')
  const [resultado, setResultado] = useState('')
  const [lista, setLista] = useState<Ligacao[]>([])
  const [resumo, setResumo] = useState<ResumoLigacoes | null>(null)
  const [carregando, setCarregando] = useState(true)

  async function carregar() {
    setCarregando(true)
    try {
      const [l, r] = await Promise.all([carregarLigacoes(de, ate), resumoLigacoes(de, ate)])
      setLista(l)
      setResumo(r)
    } catch {
      setLista([])
      setResumo(null)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [de, ate])

  const filtradas = useMemo(
    () =>
      lista.filter(
        (l) => (!quem || l.quem === quem) && (!resultado || l.resultado === resultado)
      ),
    [lista, quem, resultado]
  )

  const pessoas = useMemo(
    () => Array.from(new Set(lista.map((l) => l.quem || 'sem nome'))).sort(),
    [lista]
  )

  const taxa = resumo && resumo.total ? (100 * resumo.atendidas) / resumo.total : 0
  const porDia = (resumo?.por_dia || []).map((d) => ({
    dia: diaBonito(d.dia),
    total: d.total,
    atendidas: d.atendidas,
  }))

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-wrap items-end gap-3">
        <label className="text-[11px] text-slate-500">
          de
          <input
            type="date"
            value={de}
            onChange={(e) => setDe(e.target.value)}
            className="ml-1 border border-slate-200 rounded px-2 py-1 text-xs"
          />
        </label>
        <label className="text-[11px] text-slate-500">
          até
          <input
            type="date"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
            className="ml-1 border border-slate-200 rounded px-2 py-1 text-xs"
          />
        </label>
        <div className="flex gap-1">
          {([['hoje', 0], ['7 dias', 7], ['30 dias', 30], ['90 dias', 90]] as [string, number][]).map(
            ([rotulo, dias]) => (
              <button
                key={rotulo}
                onClick={() => {
                  setDe(diasAtras(dias))
                  setAte(hoje())
                }}
                className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                {rotulo}
              </button>
            )
          )}
        </div>
        <select
          value={quem}
          onChange={(e) => setQuem(e.target.value)}
          className="border border-slate-200 rounded px-2 py-1 text-xs"
        >
          <option value="">Todo mundo</option>
          {pessoas.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={resultado}
          onChange={(e) => setResultado(e.target.value)}
          className="border border-slate-200 rounded px-2 py-1 text-xs"
        >
          <option value="">Todos os resultados</option>
          {RESULTADOS.map((r) => (
            <option key={r.valor} value={r.valor}>
              {r.rotulo}
            </option>
          ))}
        </select>
      </div>

      <CrmLigacoesCampanha aoRegistrar={carregar} />

      {carregando ? (
        <p className="text-sm text-slate-400 text-center py-20">Carregando ligações...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Caixa titulo="Atendidas" valor={String(resumo?.atendidas ?? 0)} rodape="viraram conversa" />
            <Caixa titulo="Taxa de atendimento" valor={taxa.toFixed(0) + '%'} />
            <Caixa titulo="Ligações" valor={String(resumo?.total ?? 0)} rodape="tentativas no período" />
            <Caixa titulo="Tempo ao telefone" valor={(resumo?.minutos ?? 0) + ' min'} />
            <Caixa titulo="Pessoas faladas" valor={String(resumo?.pessoas_faladas ?? 0)} rodape="números distintos" />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Ligações por dia</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={porDia} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                    <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="total" name="tentativas" fill="#c7d2fe" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="atendidas" name="atendidas" fill="#4f46e5" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Por pessoa</h3>
              <div className="space-y-1">
                {(resumo?.por_pessoa || []).map((p) => (
                  <div key={p.quem} className="flex items-center gap-2 text-[11px] border-b border-slate-100 pb-1">
                    <span className="flex-1 text-slate-700 font-medium">{p.quem}</span>
                    <span className="text-slate-500">{p.total} ligações</span>
                    <span className="text-emerald-700">{p.atendidas} atendidas</span>
                    <span className="text-slate-400">{p.minutos} min</span>
                  </div>
                ))}
                {(resumo?.por_pessoa || []).length === 0 && (
                  <p className="text-[11px] text-slate-400">Ninguém registrou ligação no período.</p>
                )}
              </div>

              <h3 className="text-sm font-semibold text-slate-700 mt-4 mb-2">Por resultado</h3>
              <div className="flex flex-wrap gap-2">
                {(resumo?.por_resultado || []).map((r) => (
                  <span key={r.resultado} className={'text-[11px] px-2 py-1 rounded-full ' + corDoResultado(r.resultado)}>
                    {rotuloDoResultado(r.resultado)}: {r.total}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">
              Ligações do período ({filtradas.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase text-slate-400">
                  <tr className="text-left">
                    <th className="px-2 py-1">Quando</th>
                    <th className="px-2 py-1">Quem ligou</th>
                    <th className="px-2 py-1">Para</th>
                    <th className="px-2 py-1">Resultado</th>
                    <th className="px-2 py-1">Duração</th>
                    <th className="px-2 py-1">Observação</th>
                    <th className="px-2 py-1">Campanha</th>
                    <th className="px-2 py-1">Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{quandoBonito(l.quando)}</td>
                      <td className="px-2 py-1.5 text-slate-600">{l.quem}</td>
                      <td className="px-2 py-1.5">
                        {l.lead_id && onAbrirLead ? (
                          <button
                            onClick={() => onAbrirLead(l.lead_id as string)}
                            className="text-indigo-600 hover:underline"
                          >
                            {l.nome || l.telefone}
                          </button>
                        ) : (
                          <span className="text-slate-700">{l.nome || l.telefone}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={'px-1.5 py-0.5 rounded-full ' + corDoResultado(l.resultado)}>
                          {rotuloDoResultado(l.resultado)}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-slate-500">
                        {l.duracao_segundos ? duracaoBonita(l.duracao_segundos) : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-slate-600 max-w-[22rem] truncate" title={l.observacao || ''}>
                        {l.observacao || '—'}
                      </td>
                      <td className="px-2 py-1.5 text-slate-500">{l.campanha || '—'}</td>
                      <td className="px-2 py-1.5 text-slate-400">{l.origem}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtradas.length === 0 && (
                <p className="text-xs text-slate-400 py-6 text-center">Nenhuma ligação no período.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Caixa({ titulo, valor, rodape }: { titulo: string; valor: string; rodape?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{titulo}</p>
      <p className="text-xl font-semibold text-slate-800">{valor}</p>
      {rodape && <p className="text-[10px] text-slate-400">{rodape}</p>}
    </div>
  )
}
