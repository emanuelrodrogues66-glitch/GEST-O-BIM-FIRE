import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { usePermissoes } from '../lib/permissoes'
import type { Categoria, Produto } from '../lib/mef'
import { UNIDADES, carregarCategorias, carregarProdutos, reais } from '../lib/mef'

/**
 * Catálogo da MEF.
 *
 * Tabela de preço que ninguém mantém vira orçamento errado, e aí todo mundo
 * volta a orçar no Excel. Por isso o custo fica ao lado do preço na mesma
 * linha: quem atualiza um lembra do outro.
 */
export default function MefProdutos() {
  const { pode } = usePermissoes()
  const podeEditar = pode('mef.produtos.editar')
  const veCusto = pode('mef.custo.ver')

  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [catSel, setCatSel] = useState('')
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [novo, setNovo] = useState(false)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    setErro('')
    try {
      const [c, p] = await Promise.all([carregarCategorias(), carregarProdutos()])
      setCategorias(c)
      setProdutos(p)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  const nomeCategoria = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of categorias) m.set(c.id, c.nome)
    return m
  }, [categorias])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return produtos.filter((p) => {
      if (!mostrarInativos && !p.ativo) return false
      if (catSel && p.categoria_id !== catSel) return false
      if (!q) return true
      const alvo = [p.nome, p.codigo, p.descricao, nomeCategoria.get(p.categoria_id)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return alvo.includes(q)
    })
  }, [produtos, busca, catSel, mostrarInativos, nomeCategoria])

  async function salvarCampo(p: Produto, patch: Partial<Produto>) {
    setProdutos((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...patch } : x)))
    const { error } = await supabase
      .from('mef_produtos')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', p.id)
    if (error) {
      alert(error.message)
      carregar()
      return
    }
    // Preço ou custo mudou: guarda a linha do histórico, para conseguir
    // responder depois quanto isso custava em tal mês.
    if (patch.preco !== undefined || patch.custo !== undefined) {
      await supabase.from('mef_produto_precos').insert({
        produto_id: p.id,
        preco: patch.preco !== undefined ? patch.preco : p.preco,
        custo: patch.custo !== undefined ? patch.custo : p.custo,
      })
    }
  }

  if (carregando) {
    return <p className="text-sm text-slate-400 text-center py-16">Carregando o catálogo...</p>
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
          placeholder="Buscar produto..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 flex-1 min-w-[180px] max-w-xs"
        />
        <select
          value={catSel}
          onChange={(e) => setCatSel(e.target.value)}
          className="text-sm border border-slate-300 rounded-lg px-2 py-1.5"
        >
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={mostrarInativos}
            onChange={(e) => setMostrarInativos(e.target.checked)}
          />
          Mostrar inativos
        </label>
        <span className="text-xs text-slate-400 ml-auto">{filtrados.length} produto(s)</span>
        {podeEditar && (
          <button
            onClick={() => setNovo(true)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            + produto
          </button>
        )}
      </div>

      {novo && podeEditar && (
        <NovoProduto
          categorias={categorias}
          aoFechar={() => setNovo(false)}
          aoSalvar={() => {
            setNovo(false)
            carregar()
          }}
        />
      )}

      {filtrados.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-16 bg-white border border-slate-200 rounded-xl shadow-sm">
          Nenhum produto no catálogo ainda.
        </p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-200">
                <th className="text-left px-3 py-2">Produto</th>
                <th className="text-left px-2 py-2">Categoria</th>
                <th className="text-left px-2 py-2">Un</th>
                <th className="text-right px-2 py-2">Preço</th>
                {veCusto && <th className="text-right px-2 py-2">Custo</th>}
                {veCusto && <th className="text-right px-2 py-2">Margem</th>}
                <th className="text-center px-2 py-2">Ativo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtrados.map((p) => {
                const margem = Number(p.preco) - Number(p.custo)
                const margemPct = Number(p.preco) > 0 ? (margem / Number(p.preco)) * 100 : null
                return (
                  <tr key={p.id} className={p.ativo ? '' : 'opacity-50'}>
                    <td className="px-3 py-1.5">
                      <input
                        value={p.nome}
                        disabled={!podeEditar}
                        onChange={(e) =>
                          setProdutos((prev) =>
                            prev.map((x) => (x.id === p.id ? { ...x, nome: e.target.value } : x))
                          )
                        }
                        onBlur={(e) => salvarCampo(p, { nome: e.target.value })}
                        className="w-full border border-transparent hover:border-slate-200 focus:border-indigo-300 rounded px-1 py-0.5"
                      />
                      {p.codigo && (
                        <span className="text-[10px] text-slate-400 px-1">{p.codigo}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-slate-500">
                      {nomeCategoria.get(p.categoria_id)}
                    </td>
                    <td className="px-2 py-1.5 text-slate-500">{p.unidade}</td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={p.preco}
                        disabled={!podeEditar}
                        onChange={(e) =>
                          setProdutos((prev) =>
                            prev.map((x) =>
                              x.id === p.id ? { ...x, preco: Number(e.target.value) } : x
                            )
                          )
                        }
                        onBlur={(e) => salvarCampo(p, { preco: Number(e.target.value) })}
                        className="w-24 text-right tabular-nums border border-transparent hover:border-slate-200 focus:border-indigo-300 rounded px-1 py-0.5"
                      />
                    </td>
                    {veCusto && (
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={p.custo}
                          disabled={!podeEditar}
                          onChange={(e) =>
                            setProdutos((prev) =>
                              prev.map((x) =>
                                x.id === p.id ? { ...x, custo: Number(e.target.value) } : x
                              )
                            )
                          }
                          onBlur={(e) => salvarCampo(p, { custo: Number(e.target.value) })}
                          className="w-24 text-right tabular-nums border border-transparent hover:border-slate-200 focus:border-indigo-300 rounded px-1 py-0.5"
                        />
                      </td>
                    )}
                    {veCusto && (
                      <td
                        className={
                          'px-2 py-1.5 text-right tabular-nums ' +
                          (margem < 0 ? 'text-red-600' : 'text-slate-600')
                        }
                      >
                        {reais(margem)}
                        {margemPct !== null && (
                          <span className="text-[10px] text-slate-400">
                            {' '}
                            {margemPct.toFixed(0)}%
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={p.ativo}
                        disabled={!podeEditar}
                        onChange={(e) => salvarCampo(p, { ativo: e.target.checked })}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-slate-400">
        Produto que sai de linha é desmarcado, nunca apagado: some da busca e continua nos
        orçamentos antigos.
      </p>
    </div>
  )
}

function NovoProduto({
  categorias,
  aoFechar,
  aoSalvar,
}: {
  categorias: Categoria[]
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const [form, setForm] = useState({
    categoria_id: categorias.length > 0 ? categorias[0].id : '',
    codigo: '',
    nome: '',
    unidade: 'un',
    preco: '',
    custo: '',
  })
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (!form.nome.trim() || !form.categoria_id) return
    setSalvando(true)
    const { error } = await supabase.from('mef_produtos').insert({
      categoria_id: form.categoria_id,
      codigo: form.codigo.trim() || null,
      nome: form.nome.trim(),
      unidade: form.unidade,
      preco: Number(form.preco) || 0,
      custo: Number(form.custo) || 0,
    })
    setSalvando(false)
    if (error) {
      alert(error.message)
      return
    }
    aoSalvar()
  }

  return (
    <div className="bg-white border border-indigo-200 rounded-xl shadow-sm p-3 space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <Campo titulo="Nome" largura="flex-1 min-w-[200px]">
          <input
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Extintor PQS 4kg"
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
          />
        </Campo>
        <Campo titulo="Código" largura="w-28">
          <input
            value={form.codigo}
            onChange={(e) => setForm({ ...form, codigo: e.target.value })}
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
          />
        </Campo>
        <Campo titulo="Categoria" largura="w-52">
          <select
            value={form.categoria_id}
            onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
          >
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo titulo="Unidade" largura="w-24">
          <select
            value={form.unidade}
            onChange={(e) => setForm({ ...form, unidade: e.target.value })}
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
          >
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Campo>
        <Campo titulo="Preço" largura="w-28">
          <input
            type="number"
            step="0.01"
            value={form.preco}
            onChange={(e) => setForm({ ...form, preco: e.target.value })}
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs text-right"
          />
        </Campo>
        <Campo titulo="Custo" largura="w-28">
          <input
            type="number"
            step="0.01"
            value={form.custo}
            onChange={(e) => setForm({ ...form, custo: e.target.value })}
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs text-right"
          />
        </Campo>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={salvar}
          disabled={salvando || !form.nome.trim()}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-200"
        >
          Salvar produto
        </button>
        <button onClick={aoFechar} className="text-xs text-slate-500 hover:text-slate-700">
          Cancelar
        </button>
      </div>
    </div>
  )
}

function Campo({
  titulo,
  largura,
  children,
}: {
  titulo: string
  largura: string
  children: ReactNode
}) {
  return (
    <div className={largura}>
      <label className="block text-[10px] font-medium text-slate-500 mb-1">{titulo}</label>
      {children}
    </div>
  )
}
