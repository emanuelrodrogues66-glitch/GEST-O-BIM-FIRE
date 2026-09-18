import { useEffect, useMemo, useState } from 'react'
import { usePermissoes } from '../lib/permissoes'
import type { LinhaFinanceira } from '../lib/mef'
import { COR_STATUS, ROTULO_STATUS, carregarFinanceiro, dataBR, mesDe, reais, rotuloMes } from '../lib/mef'

/**
 * Financeiro da MEF.
 *
 * Uma linha por obra: o que foi vendido, o que custou de verdade, o que já
 * entrou e o que falta entrar. Orçamento em rascunho fica de fora do caixa —
 * proposta que ninguém aceitou ainda não é dinheiro.
 */
export default function MefFinanceiro({ aoAbrir }: { aoAbrir?: (id: string) => void }) {
  const { pode } = usePermissoes()
  const veCusto = pode('mef.custo.ver')

  const [linhas, setLinhas] = useState<LinhaFinanceira[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [soAprovados, setSoAprovados] = useState(true)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    setErro('')
    try {
      setLinhas(await carregarFinanceiro())
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  const filtradas = useMemo(
    () => (soAprovados ? linhas.filter((l) => l.status === 'aprovado') : linhas),
    [linhas, soAprovados]
  )

  const totais = useMemo(() => {
    let vendido = 0
    let custo = 0
    let recebido = 0
    let aReceber = 0
    for (const l of filtradas) {
      vendido += Number(l.total) || 0
      custo += Number(l.custo_real) || 0
      recebido += Number(l.recebido) || 0
      aReceber += Number(l.a_receber) || 0
    }
    return { vendido, custo, recebido, aReceber, margem: vendido - custo }
  }, [filtradas])

  // O que está previsto entrar, mês a mês, do que ainda não caiu.
  const porMes = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of filtradas) {
      const v = Number(l.a_receber) || 0
      if (v <= 0) continue
      const k = mesDe(l.proxima_previsao)
      m.set(k, (m.get(k) || 0) + v)
    }
    return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1))
  }, [filtradas])

  if (carregando) {
    return <p className="text-sm text-slate-400 text-center py-16">Montando o financeiro...</p>
  }

  return (
    <div className="space-y-3">
      {erro && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {erro}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Caixa titulo="Vendido" valor={reais(totais.vendido)} />
        {veCusto && <Caixa titulo="Custo real" valor={reais(totais.custo)} />}
        {veCusto && (
          <Caixa
            titulo="Margem"
            valor={reais(totais.margem)}
            destaque={totais.margem < 0 ? 'ruim' : 'bom'}
          />
        )}
        <Caixa titulo="Recebido" valor={reais(totais.recebido)} destaque="bom" />
        <Caixa titulo="A receber" valor={reais(totais.aReceber)} />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={soAprovados}
            onChange={(e) => setSoAprovados(e.target.checked)}
          />
          Só orçamentos aprovados
        </label>
        <button
          onClick={carregar}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300"
        >
          Atualizar
        </button>
        <span className="text-xs text-slate-400 ml-auto">{filtradas.length} obra(s)</span>
      </div>

      {porMes.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
          <h3 className="text-xs font-semibold text-slate-700 mb-2">O que falta entrar</h3>
          <div className="flex flex-wrap gap-4">
            {porMes.map((par) => (
              <div key={par[0] || 'sem'}>
                <p className="text-[10px] uppercase text-slate-400 capitalize">
                  {par[0] ? rotuloMes(par[0]) : 'sem previsão'}
                </p>
                <p className="text-sm font-semibold tabular-nums text-slate-800">
                  {reais(par[1])}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-2">
            Cada obra entra no mês da próxima parcela sem data de recebimento.
          </p>
        </div>
      )}

      {filtradas.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-16 bg-white border border-slate-200 rounded-xl shadow-sm">
          Nenhuma obra aqui ainda.
        </p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-200">
                <th className="text-left px-3 py-2">Nº</th>
                <th className="text-left px-2 py-2">Cliente</th>
                <th className="text-left px-2 py-2">Projeto</th>
                <th className="text-left px-2 py-2">Status</th>
                <th className="text-right px-2 py-2">Vendido</th>
                {veCusto && <th className="text-right px-2 py-2">Custo</th>}
                {veCusto && <th className="text-right px-2 py-2">Margem</th>}
                <th className="text-right px-2 py-2">Recebido</th>
                <th className="text-right px-2 py-2">A receber</th>
                <th className="text-left px-2 py-2">Próxima</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtradas.map((l) => {
                const margem = (Number(l.total) || 0) - (Number(l.custo_real) || 0)
                return (
                  <tr key={l.orcamento_id} className="hover:bg-slate-50">
                    <td className="px-3 py-1.5">
                      <button
                        onClick={() => aoAbrir && aoAbrir(l.orcamento_id)}
                        className="font-semibold text-slate-700 hover:text-indigo-700 hover:underline tabular-nums"
                      >
                        {l.numero}
                        {l.versao > 1 && <span className="text-slate-400">.{l.versao}</span>}
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-slate-700">{l.nome_cliente || '—'}</td>
                    <td className="px-2 py-1.5 text-slate-400">
                      {l.projeto_numero ? l.projeto_numero + ' · ' + (l.projeto_nome || '') : '—'}
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className={
                          'text-[10px] px-2 py-0.5 rounded-full font-medium ' + COR_STATUS[l.status]
                        }
                      >
                        {ROTULO_STATUS[l.status]}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-800">
                      {reais(l.total)}
                    </td>
                    {veCusto && (
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                        {reais(l.custo_real)}
                      </td>
                    )}
                    {veCusto && (
                      <td
                        className={
                          'px-2 py-1.5 text-right tabular-nums font-medium ' +
                          (margem < 0 ? 'text-red-600' : 'text-emerald-700')
                        }
                      >
                        {reais(margem)}
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">
                      {reais(l.recebido)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                      {reais(l.a_receber)}
                    </td>
                    <td className="px-2 py-1.5 text-slate-400">{dataBR(l.proxima_previsao)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-slate-400">
        Custo aqui é o que foi lançado no cartão da obra — material, mão de obra terceirizada,
        deslocamento. Obra sem custo lançado aparece com margem cheia, que não é a verdade.
      </p>
    </div>
  )
}

function Caixa({
  titulo,
  valor,
  destaque,
}: {
  titulo: string
  valor: string
  destaque?: 'bom' | 'ruim'
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-3 py-2.5">
      <p className="text-[10px] uppercase text-slate-400">{titulo}</p>
      <p
        className={
          'text-base font-semibold tabular-nums ' +
          (destaque === 'ruim'
            ? 'text-red-600'
            : destaque === 'bom'
              ? 'text-emerald-700'
              : 'text-slate-800')
        }
      >
        {valor}
      </p>
    </div>
  )
}
