import { useEffect, useMemo, useState } from 'react'
import { usePermissoes } from '../lib/permissoes'
import MefOrcamentoModal from './MefOrcamentoModal'
import type { Categoria, Orcamento, Produto, StatusOrcamento } from '../lib/mef'
import {
  COR_STATUS,
  ROTULO_STATUS,
  carregarCategorias,
  carregarItens,
  carregarOrcamentos,
  carregarProdutos,
  criarOrcamento,
  dataBR,
  reais,
  totais,
} from '../lib/mef'

/** Lista de orçamentos da MEF, com o total de cada um já calculado. */
export default function MefOrcamentos() {
  const { pode } = usePermissoes()
  const podeCriar = pode('mef.orcamento.criar')

  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [valores, setValores] = useState<Record<string, number>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [statusSel, setStatusSel] = useState('')
  const [aberto, setAberto] = useState<Orcamento | null>(null)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    setErro('')
    try {
      const [o, c, p] = await Promise.all([
        carregarOrcamentos(),
        carregarCategorias(),
        carregarProdutos(),
      ])
      setOrcamentos(o)
      setCategorias(c)
      setProdutos(p)
      calcularValores(o)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  // O total de cada orçamento sai dos itens; carrega em paralelo para a lista
  // não ficar esperando um por um.
  async function calcularValores(lista: Orcamento[]) {
    const pares = await Promise.all(
      lista.map(async (o) => {
        try {
          const itens = await carregarItens(o.id)
          return [o.id, totais(itens, Number(o.desconto_pct) || 0).total] as [string, number]
        } catch {
          return [o.id, 0] as [string, number]
        }
      })
    )
    const mapa: Record<string, number> = {}
    for (const par of pares) mapa[par[0]] = par[1]
    setValores(mapa)
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return orcamentos.filter((o) => {
      if (statusSel && o.status !== statusSel) return false
      if (!q) return true
      const alvo = [String(o.numero), o.nome_cliente, o.endereco_obra, o.responsavel]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return alvo.includes(q)
    })
  }, [orcamentos, busca, statusSel])

  async function novo() {
    try {
      const o = await criarOrcamento({ status: 'rascunho', desconto_pct: 0 })
      setOrcamentos((prev) => [o].concat(prev))
      setAberto(o)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  if (carregando) {
    return <p className="text-sm text-slate-400 text-center py-16">Carregando os orçamentos...</p>
  }

  return (
    <div className="space-y-3">
      {erro && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {erro}
        </p>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-2">
        <input
          placeholder="Buscar por número, cliente ou obra..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 flex-1 min-w-[200px] max-w-sm"
        />
        <select
          value={statusSel}
          onChange={(e) => setStatusSel(e.target.value)}
          className="text-sm border border-slate-300 rounded-lg px-2 py-1.5"
        >
          <option value="">Todos os status</option>
          {Object.keys(ROTULO_STATUS).map((s) => (
            <option key={s} value={s}>
              {ROTULO_STATUS[s as StatusOrcamento]}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-400 ml-auto">{filtrados.length} orçamento(s)</span>
        {podeCriar && (
          <button
            onClick={novo}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            + orçamento
          </button>
        )}
      </div>

      {filtrados.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-16 bg-white border border-slate-200 rounded-xl shadow-sm">
          Nenhum orçamento ainda.
        </p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm divide-y divide-slate-50">
          {filtrados.map((o) => (
            <button
              key={o.id}
              onClick={() => setAberto(o)}
              className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex flex-wrap items-center gap-3"
            >
              <span className="text-xs font-semibold text-slate-800 w-16 tabular-nums">
                {o.numero}
                {o.versao > 1 && <span className="text-slate-400">.{o.versao}</span>}
              </span>
              <span className="text-sm text-slate-700 flex-1 min-w-[160px]">
                {o.nome_cliente || 'sem cliente'}
                {o.endereco_obra && (
                  <span className="block text-[11px] text-slate-400">{o.endereco_obra}</span>
                )}
              </span>
              <span
                className={
                  'text-[10px] px-2 py-0.5 rounded-full font-medium ' + COR_STATUS[o.status]
                }
              >
                {ROTULO_STATUS[o.status]}
              </span>
              <span className="text-[11px] text-slate-400 w-24">{dataBR(o.created_at)}</span>
              <span className="text-sm font-semibold tabular-nums text-slate-800 w-28 text-right">
                {reais(valores[o.id] || 0)}
              </span>
            </button>
          ))}
        </div>
      )}

      {aberto && (
        <MefOrcamentoModal
          orcamento={aberto}
          categorias={categorias}
          produtos={produtos}
          aoFechar={() => {
            setAberto(null)
            carregar()
          }}
          aoMudar={carregar}
        />
      )}
    </div>
  )
}
