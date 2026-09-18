import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLembrado } from '../lib/lembrar'
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
  const [visao, setVisao] = useLembrado<'lista' | 'kanban'>('mef-visao', 'lista')
  const [arrastando, setArrastando] = useState<string | null>(null)

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


  /**
   * Arrastar o card muda o status na hora.
   *
   * Sem confirmação de propósito: quem move é quem sabe. O status antigo
   * continua no histórico do cartão, então engano se desfaz arrastando de
   * volta.
   */
  async function moverPara(id: string, status: StatusOrcamento) {
    const antes = orcamentos
    setOrcamentos((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)))
    const { error } = await supabase
      .from('mef_orcamentos')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      alert(error.message)
      setOrcamentos(antes)
    }
  }
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
        <div className="flex rounded-lg border border-slate-200 overflow-hidden ml-auto">
          {([['lista', 'Lista'], ['kanban', 'Kanban']] as ['lista' | 'kanban', string][]).map((par) => (
            <button
              key={par[0]}
              onClick={() => setVisao(par[0])}
              className={
                'text-xs font-medium px-3 py-1.5 ' +
                (visao === par[0]
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-500 hover:bg-slate-50')
              }
            >
              {par[1]}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400">{filtrados.length} orçamento(s)</span>
        {podeCriar && (
          <button
            onClick={novo}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            + orçamento
          </button>
        )}
      </div>

      {visao === 'kanban' ? (
        <Kanban
          orcamentos={filtrados}
          valores={valores}
          arrastando={arrastando}
          setArrastando={setArrastando}
          onSoltar={moverPara}
          onAbrir={setAberto}
        />
      ) : filtrados.length === 0 ? (
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

/**
 * Kanban dos orçamentos.
 *
 * Uma coluna por status. Arrastar o card muda o status na hora — é a mesma
 * lógica do quadro de projetos, e pelo mesmo motivo: quem acompanha o funil
 * quer mover, não abrir e escolher numa lista.
 */
function Kanban({
  orcamentos,
  valores,
  arrastando,
  setArrastando,
  onSoltar,
  onAbrir,
}: {
  orcamentos: Orcamento[]
  valores: Record<string, number>
  arrastando: string | null
  setArrastando: (id: string | null) => void
  onSoltar: (id: string, status: StatusOrcamento) => void
  onAbrir: (o: Orcamento) => void
}) {
  const COLUNAS: StatusOrcamento[] = ['rascunho', 'enviado', 'aprovado', 'recusado', 'cancelado']

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {COLUNAS.map((status) => {
        const doStatus = orcamentos.filter((o) => o.status === status)
        const soma = doStatus.reduce((s, o) => s + (valores[o.id] || 0), 0)
        return (
          <div
            key={status}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (arrastando) onSoltar(arrastando, status)
              setArrastando(null)
            }}
            className="flex-1 min-w-[230px] bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col"
          >
            <div className="px-3 py-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span
                  className={'text-[10px] px-2 py-0.5 rounded-full font-medium ' + COR_STATUS[status]}
                >
                  {ROTULO_STATUS[status]}
                </span>
                <span className="text-[10px] text-slate-400 ml-auto">{doStatus.length}</span>
              </div>
              {soma > 0 && (
                <p className="text-xs font-semibold tabular-nums text-slate-700 mt-1">
                  {reais(soma)}
                </p>
              )}
            </div>

            <div className="p-2 space-y-2 flex-1 min-h-[80px]">
              {doStatus.map((o) => (
                <div
                  key={o.id}
                  draggable
                  onDragStart={() => setArrastando(o.id)}
                  onDragEnd={() => setArrastando(null)}
                  onClick={() => onAbrir(o)}
                  className={
                    'border border-slate-200 rounded-lg px-2.5 py-2 cursor-pointer hover:border-indigo-300 hover:shadow-sm bg-white ' +
                    (arrastando === o.id ? 'opacity-40' : '')
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 tabular-nums">
                      {o.numero}
                      {o.versao > 1 ? '.' + o.versao : ''}
                    </span>
                    <span className="text-[10px] text-slate-400 ml-auto">
                      {dataBR(o.created_at)}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-800 leading-tight mt-0.5">
                    {o.nome_cliente || 'sem cliente'}
                  </p>
                  {o.endereco_obra && (
                    <p className="text-[10px] text-slate-400 leading-tight truncate">
                      {o.endereco_obra}
                    </p>
                  )}
                  <p className="text-xs font-semibold tabular-nums text-slate-700 mt-1">
                    {reais(valores[o.id] || 0)}
                  </p>
                </div>
              ))}
              {doStatus.length === 0 && (
                <p className="text-[10px] text-slate-300 text-center py-6">arraste um card aqui</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
