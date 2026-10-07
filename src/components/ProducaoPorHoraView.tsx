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
import type { ProducaoPorHora } from '../lib/produtividade'
import { horasPorTipo, producaoPorHora } from '../lib/produtividade'
import { horasLegiveis } from '../types'

function reais(v: number | null | undefined) {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function hoje() {
  return new Date().toISOString().slice(0, 10)
}
function mesesAtras(n: number) {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

/**
 * Producao por hora de cada pessoa.
 *
 * O numero que interessa nao e quantas horas alguem lancou — e o que saiu
 * delas. Cada projeto e repartido entre quem trabalhou nele, na proporcao das
 * horas, e so conta quando esta concluido: antes disso o trabalho ainda nao
 * virou entrega.
 */
export default function ProducaoPorHoraView() {
  const [de, setDe] = useState(mesesAtras(6))
  const [ate, setAte] = useState(hoje())
  const [soReais, setSoReais] = useState(false)
  const [lista, setLista] = useState<ProducaoPorHora[]>([])
  const [tipos, setTipos] = useState<{ tipo: string; projetos: number; horas_media: number; pontos_media: number }[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    producaoPorHora(de, ate, soReais)
      .then((r) => {
        if (!vivo) return
        setLista(r)
        setErro('')
      })
      .catch((e) => vivo && setErro(e.message || 'Não foi possível apurar.'))
      .finally(() => vivo && setCarregando(false))
    return () => {
      vivo = false
    }
  }, [de, ate, soReais])

  useEffect(() => {
    horasPorTipo().then(setTipos).catch(() => setTipos([]))
  }, [])

  const totalHoras = lista.reduce((s, r) => s + r.horas, 0)
  const totalValor = lista.reduce((s, r) => s + r.valor, 0)
  const mediaValorHora = totalHoras ? totalValor / totalHoras : 0
  const estimadas = lista.reduce((s, r) => s + r.horas_estimadas, 0)

  const grafico = useMemo(
    () =>
      lista
        .filter((r) => r.horas > 0)
        .map((r) => ({
          nome: r.colaborador,
          gera: Number(r.valor_por_hora || 0),
          custa: Number(r.custo_hora || 0),
        })),
    [lista]
  )

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-wrap items-end gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Produção por hora</h2>
          <p className="text-[11px] text-slate-500">
            Cada projeto é repartido entre quem lançou hora nele, na proporção das horas.
          </p>
        </div>
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
          {([['3 meses', 3], ['6 meses', 6], ['12 meses', 12]] as [string, number][]).map(
            ([rotulo, meses]) => (
              <button
                key={rotulo}
                onClick={() => {
                  setDe(mesesAtras(meses))
                  setAte(hoje())
                }}
                className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                {rotulo}
              </button>
            )
          )}
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
          <input type="checkbox" checked={soReais} onChange={(e) => setSoReais(e.target.checked)} />
          só horas lançadas no dia a dia (sem as estimadas)
        </label>
      </div>

      {erro && <p className="text-sm text-rose-600">{erro}</p>}

      {carregando ? (
        <p className="text-sm text-slate-400 text-center py-20">Apurando...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Caixa titulo="Horas no período" valor={horasLegiveis(totalHoras)} />
            <Caixa
              titulo="Valor entregue"
              valor={reais(totalValor)}
              rodape="contratos de projetos concluídos"
            />
            <Caixa titulo="Média da equipe" valor={reais(mediaValorHora) + '/h'} />
            <Caixa
              titulo="Horas estimadas"
              valor={horasLegiveis(estimadas)}
              rodape={estimadas > 0 ? 'lançamento retroativo' : 'nenhuma'}
            />
          </div>

          {estimadas > 0 && !soReais && (
            <p className="text-[11px] text-amber-700">
              Parte das horas veio do lançamento retroativo da planilha, que é estimativa. Marque a
              caixa acima para ver só as horas apontadas no dia a dia.
            </p>
          )}

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 overflow-x-auto">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">Por pessoa</h3>
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-slate-400">
                <tr className="text-left">
                  <th className="px-2 py-1">Pessoa</th>
                  <th className="px-2 py-1 text-right">Horas</th>
                  <th className="px-2 py-1 text-right">Projetos</th>
                  <th className="px-2 py-1 text-right">Pontos</th>
                  <th className="px-2 py-1 text-right">m²</th>
                  <th className="px-2 py-1 text-right">Valor entregue</th>
                  <th className="px-2 py-1 text-right">Gera por hora</th>
                  <th className="px-2 py-1 text-right">Custa por hora</th>
                  <th className="px-2 py-1 text-right">Sobra por hora</th>
                  <th className="px-2 py-1 text-right">Pontos/h</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((r) => (
                  <tr key={r.colaborador} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 font-medium text-slate-700">{r.colaborador}</td>
                    <td className="px-2 py-1.5 text-right text-slate-600">{horasLegiveis(r.horas)}</td>
                    <td className="px-2 py-1.5 text-right text-slate-500">
                      {r.projetos_equivalentes.toFixed(1)}
                      <span className="text-slate-300"> / {r.projetos_tocados}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right text-slate-600">{r.pontos.toFixed(1)}</td>
                    <td className="px-2 py-1.5 text-right text-slate-500">
                      {r.m2 ? r.m2.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right text-slate-700">{reais(r.valor)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold text-slate-800">
                      {reais(r.valor_por_hora)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-slate-500">
                      {r.custo_hora === null ? 'sem custo' : reais(r.custo_hora)}
                    </td>
                    <td
                      className={
                        'px-2 py-1.5 text-right font-semibold ' +
                        (r.custo_hora === null
                          ? 'text-slate-300'
                          : (r.margem_por_hora || 0) >= 0
                            ? 'text-emerald-700'
                            : 'text-rose-600')
                      }
                    >
                      {r.custo_hora === null ? '—' : reais(r.margem_por_hora)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-slate-500">
                      {(r.pontos_por_hora ?? 0).toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lista.length === 0 && (
              <p className="text-xs text-slate-400 py-6 text-center">
                Ninguém lançou hora no período escolhido.
              </p>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">O que gera e o que custa, por hora</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={grafico} margin={{ left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                    <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => reais(v)} />
                    <Bar dataKey="gera" name="gera por hora" fill="#4f46e5" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="custa" name="custa por hora" fill="#fda4af" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">
                Quanto costuma consumir cada tipo
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Média de horas dos projetos concluídos. Serve para orçar prazo pelo que já
                aconteceu, e não pelo que se imagina.
              </p>
              <div className="space-y-1">
                {tipos.map((t) => (
                  <div key={t.tipo} className="flex items-center gap-2 text-[11px] border-b border-slate-100 pb-1">
                    <span className="flex-1 font-medium text-slate-700">{t.tipo}</span>
                    <span className="text-slate-500">{t.projetos} projetos</span>
                    <span className="text-slate-700">{horasLegiveis(Number(t.horas_media))} em média</span>
                    <span className="text-slate-400">{Number(t.pontos_media).toFixed(1)} pts</span>
                  </div>
                ))}
                {tipos.length === 0 && (
                  <p className="text-[11px] text-slate-400">Sem projetos concluídos com horas lançadas.</p>
                )}
              </div>
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
      <p className="text-lg font-semibold text-slate-800">{valor}</p>
      {rodape && <p className="text-[10px] text-slate-400">{rodape}</p>}
    </div>
  )
}
