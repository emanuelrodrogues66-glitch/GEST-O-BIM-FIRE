import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { usePermissoes } from '../lib/permissoes'
import MefObraFinanceiro from './MefObraFinanceiro'
import { gerarPdfOrcamento } from '../lib/orcamentoPdf'
import type { Categoria, ItemOrcamento, Orcamento, Produto, StatusOrcamento } from '../lib/mef'
import type { NegociacaoDoOrcamento } from '../lib/mef'
import {
  ROTULO_STATUS,
  carregarItens,
  carregarNegociacao,
  novaVersao,
  reais,
  totais,
  totalDoItem,
} from '../lib/mef'

/**
 * Montagem do orçamento.
 *
 * A margem fica visível enquanto se monta, não depois de enviado: é na hora de
 * dar o desconto que a pessoa precisa saber quanto sobra. Quem não tem
 * permissão de custo simplesmente não vê essa parte.
 */
export default function MefOrcamentoModal({
  orcamento,
  categorias,
  produtos,
  aoFechar,
  aoMudar,
}: {
  orcamento: Orcamento
  categorias: Categoria[]
  produtos: Produto[]
  aoFechar: () => void
  aoMudar: () => void
}) {
  const { pode } = usePermissoes()
  const podeEditar = pode('mef.orcamento.criar')
  const veCusto = pode('mef.custo.ver')

  const [orc, setOrc] = useState<Orcamento>(orcamento)
  const [itens, setItens] = useState<ItemOrcamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [negociacao, setNegociacao] = useState<NegociacaoDoOrcamento | null>(null)

  useEffect(() => {
    recarregar()
  }, [orcamento.id])

  useEffect(() => {
    if (!orc.lead_id) {
      setNegociacao(null)
      return
    }
    carregarNegociacao(orc.lead_id).then(setNegociacao)
  }, [orc.lead_id])

  async function recarregar() {
    setCarregando(true)
    try {
      setItens(await carregarItens(orcamento.id))
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  const nomeCategoria = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of categorias) m.set(c.id, c.nome)
    return m
  }, [categorias])

  const achados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (q.length < 2) return []
    return produtos
      .filter((p) => p.ativo)
      .filter((p) => (p.nome + ' ' + (p.codigo || '')).toLowerCase().includes(q))
      .slice(0, 8)
  }, [produtos, busca])

  const t = useMemo(() => totais(itens, Number(orc.desconto_pct) || 0), [itens, orc.desconto_pct])

  async function salvarCabecalho(patch: Partial<Orcamento>) {
    setOrc((prev) => ({ ...prev, ...patch }))
    const { error } = await supabase
      .from('mef_orcamentos')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', orc.id)
    if (error) alert(error.message)
    else aoMudar()
  }

  async function adicionar(p: Produto) {
    setBusca('')
    const { data, error } = await supabase
      .from('mef_orcamento_itens')
      .insert({
        orcamento_id: orc.id,
        produto_id: p.id,
        categoria_nome: nomeCategoria.get(p.categoria_id) || null,
        descricao: p.nome,
        unidade: p.unidade,
        quantidade: 1,
        preco_unitario: p.preco,
        custo_unitario: p.custo,
        ordem: itens.length + 1,
      })
      .select('*')
      .single()
    if (error) {
      alert(error.message)
      return
    }
    setItens((prev) => prev.concat([data as ItemOrcamento]))
  }

  async function adicionarLivre() {
    const { data, error } = await supabase
      .from('mef_orcamento_itens')
      .insert({
        orcamento_id: orc.id,
        descricao: 'Item avulso',
        unidade: 'un',
        quantidade: 1,
        preco_unitario: 0,
        custo_unitario: 0,
        ordem: itens.length + 1,
      })
      .select('*')
      .single()
    if (error) {
      alert(error.message)
      return
    }
    setItens((prev) => prev.concat([data as ItemOrcamento]))
  }

  async function mudarItem(id: string, patch: Partial<ItemOrcamento>) {
    setItens((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
    const { error } = await supabase.from('mef_orcamento_itens').update(patch).eq('id', id)
    if (error) {
      alert(error.message)
      recarregar()
    }
  }

  async function apagarItem(i: ItemOrcamento) {
    if (!confirm('Tirar ' + i.descricao + ' do orçamento?')) return
    setItens((prev) => prev.filter((x) => x.id !== i.id))
    await supabase.from('mef_orcamento_itens').delete().eq('id', i.id)
  }

  async function gerarNovaVersao() {
    if (!confirm('Criar a versão ' + (orc.versao + 1) + ' com os mesmos itens?')) return
    setSalvando(true)
    try {
      await novaVersao(orc, itens)
      aoMudar()
      aoFechar()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const porCategoria = useMemo(() => {
    const grupos = new Map<string, ItemOrcamento[]>()
    for (const i of itens) {
      const k = i.categoria_nome || 'Sem categoria'
      const lista = grupos.get(k)
      if (lista) lista.push(i)
      else grupos.set(k, [i])
    }
    return Array.from(grupos.entries())
  }, [itens])

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl my-4">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-sm font-semibold text-slate-800">
              Orçamento {orc.numero}
              {orc.versao > 1 && <span className="text-slate-400"> · versão {orc.versao}</span>}
            </h2>
            <p className="text-[11px] text-slate-400">
              {orc.nome_cliente || 'sem cliente'}
              {negociacao && (
                <a
                  href="/comercial"
                  target="_blank"
                  rel="noopener"
                  className="text-indigo-600 hover:underline ml-1"
                  title="Abre o comercial"
                >
                  · {negociacao.nome}
                  {negociacao.etapa && ' (' + negociacao.etapa + ')'} ↗
                </a>
              )}
            </p>
          </div>
          <select
            value={orc.status}
            disabled={!podeEditar}
            onChange={(e) => salvarCabecalho({ status: e.target.value as StatusOrcamento })}
            className="text-xs border border-slate-300 rounded-lg px-2 py-1.5"
          >
            {Object.keys(ROTULO_STATUS).map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS[s as StatusOrcamento]}
              </option>
            ))}
          </select>
          <button
            onClick={() => gerarPdfOrcamento(orc, itens)}
            disabled={itens.length === 0}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700 disabled:text-slate-300"
            title="Baixa o orçamento em PDF, com a logo da MEF e sem custo nem margem"
          >
            PDF
          </button>
          {podeEditar && (
            <button
              onClick={gerarNovaVersao}
              disabled={salvando}
              className="text-xs text-indigo-600 hover:underline"
            >
              nova versão
            </button>
          )}
          <button onClick={aoFechar} className="text-slate-400 hover:text-slate-700 text-lg px-1">
            ×
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <Campo titulo="Cliente">
              <input
                value={orc.nome_cliente || ''}
                disabled={!podeEditar}
                onChange={(e) => setOrc({ ...orc, nome_cliente: e.target.value })}
                onBlur={(e) => salvarCabecalho({ nome_cliente: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
              />
            </Campo>
            <Campo titulo="Contato">
              <input
                value={orc.contato || ''}
                disabled={!podeEditar}
                onChange={(e) => setOrc({ ...orc, contato: e.target.value })}
                onBlur={(e) => salvarCabecalho({ contato: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
              />
            </Campo>
            <Campo titulo="Endereço da obra">
              <input
                value={orc.endereco_obra || ''}
                disabled={!podeEditar}
                onChange={(e) => setOrc({ ...orc, endereco_obra: e.target.value })}
                onBlur={(e) => salvarCabecalho({ endereco_obra: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
              />
            </Campo>
            <Campo titulo="Validade">
              <input
                type="date"
                value={orc.validade || ''}
                disabled={!podeEditar}
                onChange={(e) => salvarCabecalho({ validade: e.target.value || null })}
                className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
              />
            </Campo>
          </div>

          {podeEditar && (
            <div className="relative">
              <div className="flex items-center gap-2">
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Digite duas letras do produto para adicionar..."
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  onClick={adicionarLivre}
                  className="text-xs text-slate-500 hover:text-indigo-600 whitespace-nowrap"
                >
                  + item avulso
                </button>
              </div>
              {achados.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 border border-slate-200 rounded-lg bg-white shadow-lg divide-y divide-slate-100">
                  {achados.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => adicionar(p)}
                      className="w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-center gap-2"
                    >
                      <span className="text-xs font-medium text-slate-800 flex-1">{p.nome}</span>
                      <span className="text-[10px] text-slate-400">
                        {nomeCategoria.get(p.categoria_id)}
                      </span>
                      <span className="text-xs tabular-nums text-slate-600">{reais(p.preco)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {carregando ? (
            <p className="text-sm text-slate-400 text-center py-8">Carregando os itens...</p>
          ) : itens.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8 border border-dashed border-slate-200 rounded-xl">
              Nenhum item ainda. Busque um produto acima.
            </p>
          ) : (
            <div className="space-y-3">
              {porCategoria.map((grupo) => (
                <div key={grupo[0]} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-3 py-1.5 text-[10px] uppercase text-slate-500 font-medium">
                    {grupo[0]}
                  </div>
                  <div className="divide-y divide-slate-50">
                    {grupo[1].map((i) => (
                      <div key={i.id} className="px-3 py-2 flex flex-wrap items-center gap-2">
                        <input
                          value={i.descricao}
                          disabled={!podeEditar}
                          onChange={(e) =>
                            setItens((prev) =>
                              prev.map((x) =>
                                x.id === i.id ? { ...x, descricao: e.target.value } : x
                              )
                            )
                          }
                          onBlur={(e) => mudarItem(i.id, { descricao: e.target.value })}
                          className="flex-1 min-w-[160px] text-xs border border-transparent hover:border-slate-200 focus:border-indigo-300 rounded px-1 py-1"
                        />
                        <Mini titulo="qtd">
                          <input
                            type="number"
                            step="0.01"
                            value={i.quantidade}
                            disabled={!podeEditar}
                            onChange={(e) =>
                              setItens((prev) =>
                                prev.map((x) =>
                                  x.id === i.id ? { ...x, quantidade: Number(e.target.value) } : x
                                )
                              )
                            }
                            onBlur={(e) => mudarItem(i.id, { quantidade: Number(e.target.value) })}
                            className="w-16 text-right text-xs border border-slate-200 rounded px-1 py-1 tabular-nums"
                          />
                        </Mini>
                        <span className="text-[10px] text-slate-400 w-8">{i.unidade}</span>
                        <Mini titulo="preço">
                          <input
                            type="number"
                            step="0.01"
                            value={i.preco_unitario}
                            disabled={!podeEditar}
                            onChange={(e) =>
                              setItens((prev) =>
                                prev.map((x) =>
                                  x.id === i.id
                                    ? { ...x, preco_unitario: Number(e.target.value) }
                                    : x
                                )
                              )
                            }
                            onBlur={(e) =>
                              mudarItem(i.id, { preco_unitario: Number(e.target.value) })
                            }
                            className="w-24 text-right text-xs border border-slate-200 rounded px-1 py-1 tabular-nums"
                          />
                        </Mini>
                        <Mini titulo="desc %">
                          <input
                            type="number"
                            step="0.1"
                            value={i.desconto_pct}
                            disabled={!podeEditar}
                            onChange={(e) =>
                              setItens((prev) =>
                                prev.map((x) =>
                                  x.id === i.id ? { ...x, desconto_pct: Number(e.target.value) } : x
                                )
                              )
                            }
                            onBlur={(e) => mudarItem(i.id, { desconto_pct: Number(e.target.value) })}
                            className="w-16 text-right text-xs border border-slate-200 rounded px-1 py-1 tabular-nums"
                          />
                        </Mini>
                        <span className="text-xs font-semibold tabular-nums text-slate-800 w-28 text-right">
                          {reais(totalDoItem(i))}
                        </span>
                        {podeEditar && (
                          <button
                            onClick={() => apagarItem(i)}
                            className="text-slate-300 hover:text-red-600 text-xs px-1"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-slate-200 pt-3 flex flex-wrap items-end gap-4">
            <div className="w-32">
              <label className="block text-[10px] font-medium text-slate-500 mb-1">
                Desconto geral %
              </label>
              <input
                type="number"
                step="0.1"
                value={orc.desconto_pct}
                disabled={!podeEditar}
                onChange={(e) => setOrc({ ...orc, desconto_pct: Number(e.target.value) })}
                onBlur={(e) => salvarCabecalho({ desconto_pct: Number(e.target.value) })}
                className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs text-right tabular-nums"
              />
            </div>

            <div className="ml-auto text-right space-y-0.5">
              <Linha rotulo="Subtotal" valor={reais(t.subtotal)} />
              {t.desconto > 0 && <Linha rotulo="Desconto" valor={'- ' + reais(t.desconto)} />}
              <p className="text-base font-semibold text-slate-900 tabular-nums">{reais(t.total)}</p>
              {veCusto && (
                <div className="pt-1 border-t border-slate-100">
                  <Linha rotulo="Custo" valor={reais(t.custo)} />
                  <p
                    className={
                      'text-xs font-semibold tabular-nums ' +
                      (t.margem < 0 ? 'text-red-600' : 'text-emerald-700')
                    }
                  >
                    margem {reais(t.margem)}
                    {t.margemPct !== null && <span> · {t.margemPct.toFixed(0)}%</span>}
                  </p>
                </div>
              )}
            </div>
          </div>

          <MefObraFinanceiro
            orcamento={orc}
            totalOrcado={t.total}
            aoMudar={aoMudar}
          />
          <Campo titulo="Condições de pagamento">
            <textarea
              value={orc.condicoes || ''}
              disabled={!podeEditar}
              rows={2}
              onChange={(e) => setOrc({ ...orc, condicoes: e.target.value })}
              onBlur={(e) => salvarCabecalho({ condicoes: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
            />
          </Campo>
        </div>
      </div>
    </div>
  )
}

function Campo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-slate-500 mb-1">{titulo}</label>
      {children}
    </div>
  )
}

function Mini({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[9px] text-slate-400 leading-none mb-0.5">{titulo}</label>
      {children}
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <p className="text-[11px] text-slate-500">
      {rotulo} <span className="tabular-nums text-slate-700">{valor}</span>
    </p>
  )
}
