import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { LinhaPainelNumero, NumeroEnvio, Queda } from '../lib/whatsappNumeros'
import {
  TIPOS_DE_QUEDA,
  apagarQueda,
  carregarNumeros,
  carregarQuedas,
  enviosPorDia,
  numeroBonito,
  painelDeNumeros,
  rotuloDaQueda,
  salvarNumero,
  salvarQueda,
} from '../lib/whatsappNumeros'

function dataBR(iso: string | null) {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return d + '/' + m + '/' + a
}
function diaCurto(iso: string) {
  const [, m, d] = iso.slice(0, 10).split('-')
  return d + '/' + m
}
function hoje() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Os chips de envio e as quedas do WhatsApp.
 *
 * A pergunta que esta tela responde e qual volume derruba o numero. Por isso o
 * grafico marca em vermelho o dia em que o chip caiu: olhando a barra do dia e
 * as dos dias anteriores da para achar o limite na pratica, em vez de adivinhar.
 */
export default function WhatsappNumeros({ podeEditar }: { podeEditar: boolean }) {
  const [painel, setPainel] = useState<LinhaPainelNumero[]>([])
  const [numeros, setNumeros] = useState<NumeroEnvio[]>([])
  const [quedas, setQuedas] = useState<Queda[]>([])
  const [dias, setDias] = useState<{ dia: string; numero: string; envios: number; caiu: boolean }[]>([])
  const [carregando, setCarregando] = useState(true)
  const [editando, setEditando] = useState<Partial<NumeroEnvio> | null>(null)
  const [novaQueda, setNovaQueda] = useState<Partial<Queda> | null>(null)

  async function carregar() {
    setCarregando(true)
    try {
      const [p, n, q, d] = await Promise.all([
        painelDeNumeros(),
        carregarNumeros(),
        carregarQuedas(),
        enviosPorDia(60),
      ])
      setPainel(p)
      setNumeros(n)
      setQuedas(q)
      setDias(d)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const grafico = useMemo(() => {
    const mapa = new Map<string, { dia: string; envios: number; caiu: boolean }>()
    for (const d of dias) {
      const atual = mapa.get(d.dia) || { dia: diaCurto(d.dia), envios: 0, caiu: false }
      atual.envios += Number(d.envios)
      atual.caiu = atual.caiu || d.caiu
      mapa.set(d.dia, atual)
    }
    return Array.from(mapa.values())
  }, [dias])

  async function salvar() {
    if (!editando) return
    try {
      await salvarNumero(editando)
      setEditando(null)
      carregar()
    } catch (e: any) {
      alert(e.message || 'Não foi possível salvar.')
    }
  }

  async function gravarQueda() {
    if (!novaQueda?.numero || !novaQueda.inicio) {
      alert('Escolha o número e o dia.')
      return
    }
    try {
      await salvarQueda(novaQueda)
      setNovaQueda(null)
      carregar()
    } catch (e: any) {
      alert(e.message || 'Não foi possível registrar.')
    }
  }

  if (carregando) return <p className="text-sm text-slate-400 text-center py-20">Carregando números...</p>

  return (
    <div className="space-y-4">
      {/* -------------------------------------------------- chips */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Números de envio</h3>
          {podeEditar && !editando && (
            <button
              onClick={() => setEditando({ numero: '', apelido: '', responsavel: '', ativo: true })}
              className="ml-auto text-[11px] text-indigo-600 hover:underline"
            >
              + cadastrar número
            </button>
          )}
        </div>

        {editando && (
          <div className="border border-indigo-200 bg-indigo-50/40 rounded-lg p-3 grid md:grid-cols-4 gap-2">
            <input
              value={editando.numero || ''}
              onChange={(e) => setEditando({ ...editando, numero: e.target.value })}
              placeholder="DDD + número"
              className="border border-slate-200 rounded px-2 py-1.5 text-xs"
            />
            <input
              value={editando.apelido || ''}
              onChange={(e) => setEditando({ ...editando, apelido: e.target.value })}
              placeholder="Apelido (ex.: Comercial)"
              className="border border-slate-200 rounded px-2 py-1.5 text-xs"
            />
            <input
              value={editando.responsavel || ''}
              onChange={(e) => setEditando({ ...editando, responsavel: e.target.value })}
              placeholder="Responsável"
              className="border border-slate-200 rounded px-2 py-1.5 text-xs"
            />
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  checked={editando.ativo !== false}
                  onChange={(e) => setEditando({ ...editando, ativo: e.target.checked })}
                />
                ativo
              </label>
              <button onClick={salvar} className="px-3 py-1 rounded-md bg-indigo-600 text-white text-[11px]">
                salvar
              </button>
              <button onClick={() => setEditando(null)} className="text-[11px] text-slate-500">
                cancelar
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-slate-400">
              <tr className="text-left">
                <th className="px-2 py-1">Número</th>
                <th className="px-2 py-1">Responsável</th>
                <th className="px-2 py-1 text-right">Hoje</th>
                <th className="px-2 py-1 text-right">7 dias</th>
                <th className="px-2 py-1 text-right">30 dias</th>
                <th className="px-2 py-1 text-right">Total</th>
                <th className="px-2 py-1 text-right">Quedas</th>
                <th className="px-2 py-1">Última queda</th>
                <th className="px-2 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {painel.map((n) => (
                <tr key={n.numero} className="border-t border-slate-100">
                  <td className="px-2 py-1.5">
                    <span className="font-medium text-slate-700">{numeroBonito(n.numero)}</span>
                    {n.apelido && <span className="text-slate-400"> · {n.apelido}</span>}
                    {!n.ativo && <span className="ml-1 text-[10px] text-slate-400">inativo</span>}
                  </td>
                  <td className="px-2 py-1.5 text-slate-600">{n.responsavel || '—'}</td>
                  <td className="px-2 py-1.5 text-right text-slate-700 font-semibold">{n.envios_hoje}</td>
                  <td className="px-2 py-1.5 text-right text-slate-600">{n.envios_7dias}</td>
                  <td className="px-2 py-1.5 text-right text-slate-600">{n.envios_30dias}</td>
                  <td className="px-2 py-1.5 text-right text-slate-500">{n.envios_total}</td>
                  <td className="px-2 py-1.5 text-right text-rose-600">{n.quedas || '—'}</td>
                  <td className="px-2 py-1.5 text-slate-500">
                    {n.ultima_queda ? dataBR(n.ultima_queda) + ' (' + n.dias_desde_a_queda + 'd)' : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {podeEditar && (
                      <button
                        onClick={() => {
                          const n2 = numeros.find((x) => x.numero === n.numero)
                          if (n2) setEditando(n2)
                        }}
                        className="text-[11px] text-indigo-600 hover:underline"
                      >
                        editar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {painel.length === 0 && (
            <p className="text-xs text-slate-400 py-6 text-center">Nenhum número cadastrado.</p>
          )}
        </div>
      </div>

      {/* -------------------------------------------------- envios por dia */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
        <h3 className="text-sm font-semibold text-slate-700 mb-1">Envios por dia</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          Em vermelho, o dia em que o WhatsApp caiu. Olhando a barra do dia e as dos dias anteriores
          dá para achar o volume que derruba o número.
        </p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={grafico} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="envios" name="mensagens" radius={[3, 3, 0, 0]}>
                {grafico.map((d, i) => (
                  <Cell key={i} fill={d.caiu ? '#e11d48' : '#4f46e5'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* -------------------------------------------------- quedas */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Quedas do WhatsApp</h3>
          {podeEditar && !novaQueda && (
            <button
              onClick={() =>
                setNovaQueda({
                  numero: painel[0]?.numero || '',
                  tipo: 'limitado',
                  inicio: hoje(),
                })
              }
              className="ml-auto text-[11px] text-rose-600 hover:underline"
            >
              + registrar queda
            </button>
          )}
        </div>

        {novaQueda && (
          <div className="border border-rose-200 bg-rose-50/40 rounded-lg p-3 grid md:grid-cols-5 gap-2">
            <select
              value={novaQueda.numero || ''}
              onChange={(e) => setNovaQueda({ ...novaQueda, numero: e.target.value })}
              className="border border-slate-200 rounded px-2 py-1.5 text-xs bg-white"
            >
              {painel.map((n) => (
                <option key={n.numero} value={n.numero}>
                  {numeroBonito(n.numero)}
                </option>
              ))}
            </select>
            <select
              value={novaQueda.tipo || 'limitado'}
              onChange={(e) => setNovaQueda({ ...novaQueda, tipo: e.target.value })}
              className="border border-slate-200 rounded px-2 py-1.5 text-xs bg-white"
            >
              {TIPOS_DE_QUEDA.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.rotulo}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={novaQueda.inicio || ''}
              onChange={(e) => setNovaQueda({ ...novaQueda, inicio: e.target.value })}
              className="border border-slate-200 rounded px-2 py-1.5 text-xs"
            />
            <input
              value={novaQueda.observacao || ''}
              onChange={(e) => setNovaQueda({ ...novaQueda, observacao: e.target.value })}
              placeholder="O que apareceu na tela"
              className="border border-slate-200 rounded px-2 py-1.5 text-xs"
            />
            <div className="flex gap-2">
              <button onClick={gravarQueda} className="px-3 py-1 rounded-md bg-rose-600 text-white text-[11px]">
                registrar
              </button>
              <button onClick={() => setNovaQueda(null)} className="text-[11px] text-slate-500">
                cancelar
              </button>
            </div>
          </div>
        )}

        <div className="space-y-1">
          {quedas.map((q) => (
            <div key={q.id} className="flex flex-wrap items-center gap-2 text-[11px] border-b border-slate-100 pb-1">
              <span className="font-medium text-slate-700">{numeroBonito(q.numero)}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">
                {rotuloDaQueda(q.tipo)}
              </span>
              <span className="text-slate-600">
                {dataBR(q.inicio)}
                {q.fim ? ' até ' + dataBR(q.fim) : ' · sem data de volta'}
              </span>
              {q.mensagens_no_dia !== null && (
                <span className="text-slate-500">
                  {q.mensagens_no_dia} no dia · {q.mensagens_7dias} em 7 dias
                </span>
              )}
              {q.observacao && <span className="text-slate-400">{q.observacao}</span>}
              {podeEditar && (
                <button
                  onClick={async () => {
                    if (!confirm('Apagar este registro de queda?')) return
                    await apagarQueda(q.id)
                    carregar()
                  }}
                  className="ml-auto text-[11px] text-slate-400 hover:text-rose-600"
                >
                  apagar
                </button>
              )}
            </div>
          ))}
          {quedas.length === 0 && (
            <p className="text-[11px] text-slate-400">Nenhuma queda registrada.</p>
          )}
        </div>
      </div>
    </div>
  )
}
