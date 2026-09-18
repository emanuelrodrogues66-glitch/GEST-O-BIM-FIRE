import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { usePermissoes } from '../lib/permissoes'
import type { Custo, Orcamento, Pagamento, ProjetoResumo } from '../lib/mef'
import {
  TIPOS_CUSTO,
  buscarProjetos,
  carregarCustos,
  carregarPagamentos,
  dataBR,
  reais,
  rotuloTipoCusto,
} from '../lib/mef'

/**
 * A obra por dentro: o que saiu e o que entrou.
 *
 * O orçamento diz quanto foi vendido; só isto aqui diz quanto sobrou. Mão de
 * obra terceirizada e material comprado na hora não estão no catálogo, então
 * sem lançar custo a margem do cartão continua sendo chute.
 */
export default function MefObraFinanceiro({
  orcamento,
  totalOrcado,
  aoMudar,
}: {
  orcamento: Orcamento
  totalOrcado: number
  aoMudar: () => void
}) {
  const { pode } = usePermissoes()
  const veCusto = pode('mef.custo.ver')
  const veFinanceiro = pode('mef.financeiro.ver')
  const podeLancar = pode('mef.financeiro.editar')

  const [custos, setCustos] = useState<Custo[]>([])
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [buscaProjeto, setBuscaProjeto] = useState('')
  const [achados, setAchados] = useState<ProjetoResumo[]>([])
  const [projeto, setProjeto] = useState<ProjetoResumo | null>(null)

  const hoje = new Date().toISOString().slice(0, 10)
  const [novoCusto, setNovoCusto] = useState({
    tipo: 'material',
    descricao: '',
    fornecedor: '',
    valor: '',
    data: hoje,
  })
  const [novoPag, setNovoPag] = useState({
    descricao: 'Pagamento',
    valor: '',
    data_prevista: '',
    data_recebimento: '',
    forma: '',
  })

  useEffect(() => {
    carregar()
  }, [orcamento.id])

  useEffect(() => {
    let ativo = true
    buscarProjetos(buscaProjeto).then((r) => {
      if (ativo) setAchados(r)
    })
    return () => {
      ativo = false
    }
  }, [buscaProjeto])

  useEffect(() => {
    if (!orcamento.project_id) {
      setProjeto(null)
      return
    }
    supabase
      .from('projects')
      .select('id, numero, nome')
      .eq('id', orcamento.project_id)
      .maybeSingle()
      .then(({ data }) => setProjeto((data as ProjetoResumo) || null))
  }, [orcamento.project_id])

  async function carregar() {
    try {
      if (veCusto) setCustos(await carregarCustos(orcamento.id))
      if (veFinanceiro) setPagamentos(await carregarPagamentos(orcamento.id))
    } catch (e) {
      console.error(e)
    }
  }

  const totalCusto = useMemo(
    () => custos.reduce((s, c) => s + (Number(c.valor) || 0), 0),
    [custos]
  )
  const recebido = useMemo(
    () => pagamentos.filter((p) => p.data_recebimento).reduce((s, p) => s + (Number(p.valor) || 0), 0),
    [pagamentos]
  )
  const aReceber = useMemo(
    () => pagamentos.filter((p) => !p.data_recebimento).reduce((s, p) => s + (Number(p.valor) || 0), 0),
    [pagamentos]
  )
  const margem = totalOrcado - totalCusto

  async function ligarProjeto(p: ProjetoResumo | null) {
    setBuscaProjeto('')
    setAchados([])
    const { error } = await supabase
      .from('mef_orcamentos')
      .update({ project_id: p ? p.id : null, updated_at: new Date().toISOString() })
      .eq('id', orcamento.id)
    if (error) {
      alert(error.message)
      return
    }
    setProjeto(p)
    aoMudar()
  }

  async function lancarCusto() {
    const v = Number(novoCusto.valor)
    if (!novoCusto.descricao.trim() || !v) return
    const { data, error } = await supabase
      .from('mef_custos')
      .insert({
        orcamento_id: orcamento.id,
        tipo: novoCusto.tipo,
        descricao: novoCusto.descricao.trim(),
        fornecedor: novoCusto.fornecedor.trim() || null,
        valor: v,
        data: novoCusto.data,
      })
      .select('*')
      .single()
    if (error) {
      alert(error.message)
      return
    }
    setCustos((prev) => prev.concat([data as Custo]))
    setNovoCusto({ tipo: novoCusto.tipo, descricao: '', fornecedor: '', valor: '', data: novoCusto.data })
    aoMudar()
  }

  async function apagarCusto(c: Custo) {
    if (!confirm('Apagar o custo ' + c.descricao + '?')) return
    setCustos((prev) => prev.filter((x) => x.id !== c.id))
    await supabase.from('mef_custos').delete().eq('id', c.id)
    aoMudar()
  }

  async function lancarPagamento() {
    const v = Number(novoPag.valor)
    if (!v) return
    const { data, error } = await supabase
      .from('mef_pagamentos')
      .insert({
        orcamento_id: orcamento.id,
        descricao: novoPag.descricao.trim() || 'Pagamento',
        valor: v,
        data_prevista: novoPag.data_prevista || null,
        data_recebimento: novoPag.data_recebimento || null,
        forma: novoPag.forma.trim() || null,
        ordem: pagamentos.length + 1,
      })
      .select('*')
      .single()
    if (error) {
      alert(error.message)
      return
    }
    setPagamentos((prev) => prev.concat([data as Pagamento]))
    setNovoPag({ descricao: 'Pagamento', valor: '', data_prevista: '', data_recebimento: '', forma: '' })
    aoMudar()
  }

  async function mudarPagamento(id: string, patch: Partial<Pagamento>) {
    setPagamentos((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
    const { error } = await supabase.from('mef_pagamentos').update(patch).eq('id', id)
    if (error) alert(error.message)
    else aoMudar()
  }

  async function apagarPagamento(p: Pagamento) {
    if (!confirm('Apagar o pagamento de ' + reais(p.valor) + '?')) return
    setPagamentos((prev) => prev.filter((x) => x.id !== p.id))
    await supabase.from('mef_pagamentos').delete().eq('id', p.id)
    aoMudar()
  }

  return (
    <div className="space-y-4 border-t border-slate-200 pt-4">
      {/* ---------- vínculo com o projeto ---------- */}
      <div>
        <label className="block text-[10px] font-medium text-slate-500 mb-1">
          Projeto da BIM Fire
        </label>
        {projeto ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-700 bg-slate-100 rounded-lg px-2 py-1">
              {projeto.numero} · {projeto.nome}
            </span>
            <a
              href={'/?projeto=' + projeto.numero}
              target="_blank"
              rel="noopener"
              className="text-[10px] text-indigo-600 hover:underline"
            >
              abrir o cartão ↗
            </a>
            <button
              onClick={() => ligarProjeto(null)}
              className="text-[10px] text-slate-400 hover:text-red-600"
            >
              desvincular
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              value={buscaProjeto}
              onChange={(e) => setBuscaProjeto(e.target.value)}
              placeholder="Digite o número ou o nome do projeto..."
              className="w-full max-w-md border border-slate-300 rounded-md px-2 py-1.5 text-xs"
            />
            {achados.length > 0 && (
              <div className="absolute z-10 left-0 max-w-md w-full mt-1 border border-slate-200 rounded-lg bg-white shadow-lg divide-y divide-slate-100">
                {achados.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => ligarProjeto(p)}
                    className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 text-xs"
                  >
                    <span className="text-slate-400 tabular-nums">{p.numero}</span> {p.nome}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---------- custos ---------- */}
      {veCusto && (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-50 px-3 py-1.5 flex items-center gap-2">
            <span className="text-[10px] uppercase text-slate-500 font-medium flex-1">
              Custos da obra
            </span>
            <span className="text-xs font-semibold tabular-nums text-slate-700">
              {reais(totalCusto)}
            </span>
          </div>

          {custos.length > 0 && (
            <div className="divide-y divide-slate-50">
              {custos.map((c) => (
                <div key={c.id} className="px-3 py-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                    {rotuloTipoCusto(c.tipo)}
                  </span>
                  <span className="text-slate-700 flex-1 min-w-[140px]">{c.descricao}</span>
                  {c.fornecedor && <span className="text-[10px] text-slate-400">{c.fornecedor}</span>}
                  <span className="text-[10px] text-slate-400 w-20">{dataBR(c.data)}</span>
                  <span className="tabular-nums font-medium text-slate-800 w-24 text-right">
                    {reais(c.valor)}
                  </span>
                  {podeLancar && (
                    <button
                      onClick={() => apagarCusto(c)}
                      className="text-slate-300 hover:text-red-600 px-1"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {podeLancar && (
            <div className="px-3 py-2 flex flex-wrap items-end gap-2 bg-white border-t border-slate-100">
              <select
                value={novoCusto.tipo}
                onChange={(e) => setNovoCusto({ ...novoCusto, tipo: e.target.value })}
                className="text-xs border border-slate-300 rounded-md px-2 py-1.5"
              >
                {TIPOS_CUSTO.map((par) => (
                  <option key={par[0]} value={par[0]}>
                    {par[1]}
                  </option>
                ))}
              </select>
              <input
                value={novoCusto.descricao}
                onChange={(e) => setNovoCusto({ ...novoCusto, descricao: e.target.value })}
                placeholder="O que foi"
                className="text-xs border border-slate-300 rounded-md px-2 py-1.5 flex-1 min-w-[140px]"
              />
              <input
                value={novoCusto.fornecedor}
                onChange={(e) => setNovoCusto({ ...novoCusto, fornecedor: e.target.value })}
                placeholder="Fornecedor"
                className="text-xs border border-slate-300 rounded-md px-2 py-1.5 w-32"
              />
              <input
                type="date"
                value={novoCusto.data}
                onChange={(e) => setNovoCusto({ ...novoCusto, data: e.target.value })}
                className="text-xs border border-slate-300 rounded-md px-2 py-1.5"
              />
              <input
                type="number"
                step="0.01"
                value={novoCusto.valor}
                onChange={(e) => setNovoCusto({ ...novoCusto, valor: e.target.value })}
                placeholder="0,00"
                className="text-xs border border-slate-300 rounded-md px-2 py-1.5 w-24 text-right tabular-nums"
              />
              <button
                onClick={lancarCusto}
                disabled={!novoCusto.descricao.trim() || !Number(novoCusto.valor)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-700 text-white hover:bg-slate-800 disabled:bg-slate-200"
              >
                lançar custo
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---------- pagamentos ---------- */}
      {veFinanceiro && (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-emerald-50/60 px-3 py-1.5 flex flex-wrap items-center gap-3">
            <span className="text-[10px] uppercase text-emerald-800 font-medium flex-1">
              Pagamentos do cliente
            </span>
            <span className="text-[11px] text-emerald-800">
              recebido <strong className="tabular-nums">{reais(recebido)}</strong>
            </span>
            {aReceber > 0 && (
              <span className="text-[11px] text-slate-500">
                a receber <strong className="tabular-nums">{reais(aReceber)}</strong>
              </span>
            )}
          </div>

          {pagamentos.length > 0 && (
            <div className="divide-y divide-slate-50">
              {pagamentos.map((p) => (
                <div key={p.id} className="px-3 py-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-700 flex-1 min-w-[120px]">{p.descricao}</span>
                  {p.forma && <span className="text-[10px] text-slate-400">{p.forma}</span>}
                  <label className="text-[10px] text-slate-400 flex items-center gap-1">
                    previsto
                    <input
                      type="date"
                      value={p.data_prevista || ''}
                      disabled={!podeLancar}
                      onChange={(e) =>
                        mudarPagamento(p.id, { data_prevista: e.target.value || null })
                      }
                      className="border border-slate-200 rounded px-1 py-0.5 text-[10px]"
                    />
                  </label>
                  <label className="text-[10px] text-slate-400 flex items-center gap-1">
                    recebido
                    <input
                      type="date"
                      value={p.data_recebimento || ''}
                      disabled={!podeLancar}
                      onChange={(e) =>
                        mudarPagamento(p.id, { data_recebimento: e.target.value || null })
                      }
                      className="border border-slate-200 rounded px-1 py-0.5 text-[10px]"
                    />
                  </label>
                  <span
                    className={
                      'tabular-nums font-medium w-24 text-right ' +
                      (p.data_recebimento ? 'text-emerald-700' : 'text-slate-800')
                    }
                  >
                    {reais(p.valor)}
                  </span>
                  {podeLancar && (
                    <button
                      onClick={() => apagarPagamento(p)}
                      className="text-slate-300 hover:text-red-600 px-1"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {podeLancar && (
            <div className="px-3 py-2 flex flex-wrap items-end gap-2 bg-white border-t border-slate-100">
              <input
                value={novoPag.descricao}
                onChange={(e) => setNovoPag({ ...novoPag, descricao: e.target.value })}
                placeholder="Entrada, parcela 1..."
                className="text-xs border border-slate-300 rounded-md px-2 py-1.5 flex-1 min-w-[130px]"
              />
              <input
                value={novoPag.forma}
                onChange={(e) => setNovoPag({ ...novoPag, forma: e.target.value })}
                placeholder="Pix, boleto..."
                className="text-xs border border-slate-300 rounded-md px-2 py-1.5 w-28"
              />
              <Rotulo titulo="previsto para">
                <input
                  type="date"
                  value={novoPag.data_prevista}
                  onChange={(e) => setNovoPag({ ...novoPag, data_prevista: e.target.value })}
                  className="text-xs border border-slate-300 rounded-md px-2 py-1.5"
                />
              </Rotulo>
              <Rotulo titulo="recebido em">
                <input
                  type="date"
                  value={novoPag.data_recebimento}
                  onChange={(e) => setNovoPag({ ...novoPag, data_recebimento: e.target.value })}
                  className="text-xs border border-slate-300 rounded-md px-2 py-1.5"
                />
              </Rotulo>
              <input
                type="number"
                step="0.01"
                value={novoPag.valor}
                onChange={(e) => setNovoPag({ ...novoPag, valor: e.target.value })}
                placeholder="0,00"
                className="text-xs border border-slate-300 rounded-md px-2 py-1.5 w-24 text-right tabular-nums"
              />
              <button
                onClick={lancarPagamento}
                disabled={!Number(novoPag.valor)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-200"
              >
                lançar entrada
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---------- o resumo da obra ---------- */}
      {veCusto && (
        <div className="flex flex-wrap items-center gap-4 text-xs bg-slate-50 rounded-lg px-3 py-2">
          <Resumo titulo="Vendido" valor={reais(totalOrcado)} />
          <Resumo titulo="Custo real" valor={reais(totalCusto)} />
          <Resumo
            titulo="Margem realizada"
            valor={reais(margem)}
            cor={margem < 0 ? 'text-red-600' : 'text-emerald-700'}
          />
          {veFinanceiro && <Resumo titulo="Já recebido" valor={reais(recebido)} />}
          {veFinanceiro && totalOrcado - recebido > 0.005 && (
            <Resumo titulo="Falta receber" valor={reais(totalOrcado - recebido)} />
          )}
        </div>
      )}
    </div>
  )
}

function Rotulo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[9px] text-slate-400 leading-none mb-0.5">{titulo}</label>
      {children}
    </div>
  )
}

function Resumo({ titulo, valor, cor }: { titulo: string; valor: string; cor?: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase text-slate-400 leading-none">{titulo}</p>
      <p className={'text-sm font-semibold tabular-nums ' + (cor || 'text-slate-800')}>{valor}</p>
    </div>
  )
}
