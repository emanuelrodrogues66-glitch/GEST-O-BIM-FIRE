import { useEffect, useMemo, useState } from 'react'
import { supabase, carregarTabelaCompleta } from '../lib/supabase'
import type { Cliente, Parceiro } from '../lib/cadastros'
import { carregarClientes, carregarParceiros, renomearCadastro } from '../lib/cadastros'
import { carimboDeHoje, exportarParaExcel } from '../lib/exportarExcel'
import type { Project } from '../types'
import { tipoColor } from '../types'

type FichaLigada = {
  project_id: string
  cliente_id: string | null
  parceiro_id: string | null
  nome_responsavel: string | null
  nome_parceiro: string | null
}

/** Contadores que a lista mostra ao lado de cada cadastro. */
type Historico = {
  projetos: number
  aprovados: number
  ultimo: string | null
  tipos: Record<string, number>
  ids: string[]
}

function dataBR(iso: string | null) {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

function chave(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Lista de clientes e parceiros, com o histórico de cada um.
 *
 * Saber que ELIAS já fez 7 projetos com o escritório muda a conversa na hora
 * de negociar o oitavo — e é uma informação que hoje só existe na memória de
 * quem estava lá.
 */
export default function CadastrosView({
  onProjectClick,
  leads,
}: {
  onProjectClick?: (id: string) => void
  /**
   * Quando o comercial passa os leads, a lista ganha a coluna de negociações.
   *
   * Contato que só negociou e ainda não fechou existe na base do mesmo jeito —
   * é justamente ele que o comercial precisa achar. Na gestão de projetos essa
   * coluna não aparece, porque lá o assunto é projeto.
   */
  leads?: { cliente_id: string | null; parceiro_id: string | null; estado: string }[]
}) {
  const [aba, setAba] = useState<'clientes' | 'parceiros'>('clientes')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [parceiros, setParceiros] = useState<Parceiro[]>([])
  const [projetos, setProjetos] = useState<Project[]>([])
  const [fichas, setFichas] = useState<FichaLigada[]>([])
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<'projetos' | 'nome' | 'ultimo'>('projetos')
  const [carregando, setCarregando] = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    const [cl, pa, pr, fi] = await Promise.all([
      carregarClientes(),
      carregarParceiros(),
      carregarTabelaCompleta<Project>('projects'),
      carregarTabelaCompleta<FichaLigada>(
        'project_clients',
        'project_id, cliente_id, parceiro_id, nome_responsavel, nome_parceiro'
      ),
    ])
    setClientes(cl)
    setParceiros(pa)
    setProjetos(pr)
    setFichas(fi)
    setCarregando(false)
  }

  const aprovacoes = useMemo(() => new Map<string, string>(), [])

  /**
   * Histórico por cadastro.
   *
   * Casa pelo id quando existe e cai no nome quando não — ficha antiga pode
   * não ter sido ligada, e deixar de contar um projeto seria pior do que
   * arriscar um homônimo.
   */
  const historicos = useMemo(() => {
    const porProjeto = new Map(projetos.map((p) => [p.id, p]))
    const mapa = new Map<string, Historico>()

    function registrar(chaveId: string, projectId: string) {
      const p = porProjeto.get(projectId)
      if (!p) return
      if (!mapa.has(chaveId)) {
        mapa.set(chaveId, { projetos: 0, aprovados: 0, ultimo: null, tipos: {}, ids: [] })
      }
      const h = mapa.get(chaveId)!
      h.projetos += 1
      h.ids.push(projectId)
      if (p.tipo) h.tipos[p.tipo] = (h.tipos[p.tipo] || 0) + 1
      if (p.status === 'Concluído') h.aprovados += 1
      const data = p.data_inicio
      if (data && (!h.ultimo || data > h.ultimo)) h.ultimo = data
    }

    const porNomeCliente = new Map(clientes.map((c) => [chave(c.nome), c.id]))
    const porNomeParceiro = new Map(parceiros.map((p) => [chave(p.nome), p.id]))

    for (const f of fichas) {
      const idCliente =
        f.cliente_id || (f.nome_responsavel ? porNomeCliente.get(chave(f.nome_responsavel)) : null)
      if (idCliente) registrar(idCliente, f.project_id)

      const idParceiro =
        f.parceiro_id || (f.nome_parceiro ? porNomeParceiro.get(chave(f.nome_parceiro)) : null)
      if (idParceiro) registrar(idParceiro, f.project_id)
    }

    return mapa
  }, [fichas, projetos, clientes, parceiros])

  const vazio: Historico = { projetos: 0, aprovados: 0, ultimo: null, tipos: {}, ids: [] }

  const listaClientes = useMemo(() => {
    const q = chave(busca)
    return clientes
      .filter((c) => !q || chave(c.nome).includes(q) || chave(c.cidade || '').includes(q))
      .sort((a, b) => {
        const ha = historicos.get(a.id) || vazio
        const hb = historicos.get(b.id) || vazio
        if (ordem === 'nome') return a.nome.localeCompare(b.nome)
        if (ordem === 'ultimo') return (hb.ultimo || '').localeCompare(ha.ultimo || '')
        return hb.projetos - ha.projetos || a.nome.localeCompare(b.nome)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes, busca, ordem, historicos])

  const listaParceiros = useMemo(() => {
    const q = chave(busca)
    return parceiros
      .filter((p) => !q || chave(p.nome).includes(q))
      .sort((a, b) => {
        const ha = historicos.get(a.id) || vazio
        const hb = historicos.get(b.id) || vazio
        if (ordem === 'nome') return a.nome.localeCompare(b.nome)
        if (ordem === 'ultimo') return (hb.ultimo || '').localeCompare(ha.ultimo || '')
        return hb.projetos - ha.projetos || a.nome.localeCompare(b.nome)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parceiros, busca, ordem, historicos])

  function exportar() {
    if (aba === 'clientes') {
      exportarParaExcel({
        nomeArquivo: `Clientes BIM Fire - ${carimboDeHoje()}.xlsx`,
        nomeAba: 'Clientes',
        linhas: listaClientes,
        colunas: [
          { titulo: 'Cliente', valor: (c) => c.nome, largura: 34 },
          { titulo: 'Contato', valor: (c) => c.contato || '', largura: 18 },
          { titulo: 'E-mail', valor: (c) => c.email || '', largura: 28 },
          { titulo: 'CNPJ / CPF', valor: (c) => c.cnpj || '', largura: 20 },
          { titulo: 'Endereço', valor: (c) => c.endereco || '', largura: 40 },
          { titulo: 'Cidade', valor: (c) => c.cidade || '', largura: 18 },
          { titulo: 'UF', valor: (c) => c.estado || '', largura: 6 },
          {
            titulo: 'Projetos',
            valor: (c) => (historicos.get(c.id) || vazio).projetos,
            largura: 10,
          },
          {
            titulo: 'Concluídos',
            valor: (c) => (historicos.get(c.id) || vazio).aprovados,
            largura: 11,
          },
          {
            titulo: 'Último projeto',
            valor: (c) => dataBR((historicos.get(c.id) || vazio).ultimo),
            largura: 14,
          },
          { titulo: 'Observação', valor: (c) => c.observacao || '', largura: 30 },
        ],
      })
      return
    }

    exportarParaExcel({
      nomeArquivo: `Parceiros BIM Fire - ${carimboDeHoje()}.xlsx`,
      nomeAba: 'Parceiros',
      linhas: listaParceiros,
      colunas: [
        { titulo: 'Parceiro', valor: (p) => p.nome, largura: 34 },
        { titulo: 'Contato', valor: (p) => p.contato || '', largura: 18 },
        { titulo: 'E-mail', valor: (p) => p.email || '', largura: 28 },
        { titulo: 'CNPJ / CPF', valor: (p) => p.cnpj || '', largura: 20 },
        { titulo: 'Endereço', valor: (p) => p.endereco || '', largura: 40 },
        { titulo: 'Projetos', valor: (p) => (historicos.get(p.id) || vazio).projetos, largura: 10 },
        {
          titulo: 'Concluídos',
          valor: (p) => (historicos.get(p.id) || vazio).aprovados,
          largura: 11,
        },
        {
          titulo: 'Último projeto',
          valor: (p) => dataBR((historicos.get(p.id) || vazio).ultimo),
          largura: 14,
        },
        { titulo: 'Observação', valor: (p) => p.observacao || '', largura: 30 },
      ],
    })
  }

  async function renomear(tabela: 'clientes' | 'parceiros', id: string, atual: string, novo: string) {
    const nome = novo.trim()
    if (!nome || nome === atual) return
    try {
      const cartoes = await renomearCadastro(tabela, id, nome)
      await carregar()
      if (cartoes > 0) {
        alert(`Nome atualizado aqui e em ${cartoes} cartão(ões) de projeto ligado(s) a este cadastro.`)
      }
    } catch (e: any) {
      alert(e.message)
      carregar()
    }
  }

  /** Negociações por cadastro: quantas ao todo e quantas ainda em aberto. */
  const negocios = useMemo(() => {
    const mapa = new Map<string, { total: number; abertas: number }>()
    for (const l of leads || []) {
      for (const id of [l.cliente_id, l.parceiro_id]) {
        if (!id) continue
        const atual = mapa.get(id) || { total: 0, abertas: 0 }
        atual.total += 1
        if (l.estado === 'aberta') atual.abertas += 1
        mapa.set(id, atual)
      }
    }
    return mapa
  }, [leads])

  async function salvarCampo(tabela: 'clientes' | 'parceiros', id: string, patch: any) {
    await supabase
      .from(tabela)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    carregar()
  }

  if (carregando) {
    return <p className="text-sm text-slate-400 text-center py-10">Carregando cadastros...</p>
  }

  const lista: (Cliente | Parceiro)[] = aba === 'clientes' ? listaClientes : listaParceiros
  const tabela = aba
  const totalProjetos = lista.reduce((s, i) => s + (historicos.get(i.id) || vazio).projetos, 0)

  return (
    <div className="space-y-4">
      {/* ---------- Cabeçalho ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {(
            [
              ['clientes', `Clientes (${clientes.length})`],
              ['parceiros', `Parceiros (${parceiros.length})`],
            ] as ['clientes' | 'parceiros', string][]
          ).map(([v, rotulo]) => (
            <button
              key={v}
              onClick={() => {
                setAba(v)
                setExpandido(null)
              }}
              className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
                aba === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou cidade"
          className="flex-1 min-w-[180px] border border-slate-300 rounded-md px-2 py-1.5 text-xs"
        />

        <select
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as typeof ordem)}
          className="text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white"
        >
          <option value="projetos">Mais projetos</option>
          <option value="ultimo">Mais recentes</option>
          <option value="nome">Nome</option>
        </select>

        <button
          onClick={exportar}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          ⬇ Exportar para Excel
        </button>
      </div>

      <p className="text-[11px] text-slate-500">
        {lista.length} {aba} · {totalProjetos} vínculo{totalProjetos === 1 ? '' : 's'} com projetos.
        Clique numa linha para editar os dados e ver os projetos. Corrigir o nome aqui corrige
        também nos cartões ligados a este cadastro.
      </p>

      {/* ---------- Tabela ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-200">
              <th className="text-left py-2 pl-4">{aba === 'clientes' ? 'Cliente' : 'Parceiro'}</th>
              <th className="text-left">Contato</th>
              <th className="text-left">E-mail</th>
              <th className="text-left">CNPJ / CPF</th>
              {aba === 'clientes' && <th className="text-left">Cidade</th>}
              {leads && <th className="text-right">Negociações</th>}
              <th className="text-right">Projetos</th>
              <th className="text-right">Concl.</th>
              <th className="text-left pl-3 pr-4">Último</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((item) => {
              const h = historicos.get(item.id) || vazio
              const aberto = expandido === item.id
              const cliente = item as Cliente
              return (
                <>
                  <tr
                    key={item.id}
                    onClick={() => setExpandido(aberto ? null : item.id)}
                    className={`border-b border-slate-100 cursor-pointer hover:bg-slate-50 ${
                      aberto ? 'bg-indigo-50/40' : ''
                    }`}
                  >
                    <td className="py-2 pl-4 font-medium text-slate-800 max-w-[240px] truncate">
                      {item.nome}
                    </td>
                    <td className="text-slate-600 tabular-nums">{item.contato || '—'}</td>
                    <td className="text-slate-500 max-w-[200px] truncate">{item.email || '—'}</td>
                    <td className="text-slate-500 tabular-nums">{item.cnpj || '—'}</td>
                    {aba === 'clientes' && (
                      <td className="text-slate-500">
                        {[cliente.cidade, cliente.estado].filter(Boolean).join(' - ') || '—'}
                      </td>
                    )}
                    {leads && (
                      <td className="text-right tabular-nums">
                        {negocios.get(item.id) ? (
                          <>
                            <span className="text-slate-700">{negocios.get(item.id)!.total}</span>
                            {negocios.get(item.id)!.abertas > 0 && (
                              <span className="text-[10px] text-cobre-600 ml-1">
                                {negocios.get(item.id)!.abertas} em aberto
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    )}
                    <td className="text-right tabular-nums font-semibold text-slate-800">
                      {h.projetos || '—'}
                    </td>
                    <td className="text-right tabular-nums text-emerald-700">
                      {h.aprovados || '—'}
                    </td>
                    <td className="pl-3 pr-4 text-slate-400 tabular-nums">{dataBR(h.ultimo)}</td>
                  </tr>

                  {aberto && (
                    <tr key={`${item.id}-detalhe`} className="bg-slate-50/60">
                      <td colSpan={(aba === 'clientes' ? 8 : 7) + (leads ? 1 : 0)} className="px-4 py-3">
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Campo
                              rotulo="Nome"
                              valor={item.nome}
                              onSalvar={(v) => renomear(tabela, item.id, item.nome, v)}
                            />
                            <Campo
                              rotulo="Contato"
                              valor={item.contato || ''}
                              onSalvar={(v) => salvarCampo(tabela, item.id, { contato: v || null })}
                            />
                            <Campo
                              rotulo="E-mail"
                              valor={item.email || ''}
                              onSalvar={(v) => salvarCampo(tabela, item.id, { email: v || null })}
                            />
                            <Campo
                              rotulo="CNPJ / CPF"
                              valor={item.cnpj || ''}
                              onSalvar={(v) => salvarCampo(tabela, item.id, { cnpj: v || null })}
                            />
                            <Campo
                              rotulo="Endereço"
                              valor={item.endereco || ''}
                              onSalvar={(v) => salvarCampo(tabela, item.id, { endereco: v || null })}
                            />
                            {aba === 'clientes' && (
                              <div className="flex gap-2">
                                <Campo
                                  rotulo="Cidade"
                                  valor={cliente.cidade || ''}
                                  onSalvar={(v) =>
                                    salvarCampo(tabela, item.id, { cidade: v || null })
                                  }
                                />
                                <Campo
                                  rotulo="UF"
                                  valor={cliente.estado || ''}
                                  onSalvar={(v) =>
                                    salvarCampo(tabela, item.id, { estado: v || null })
                                  }
                                />
                              </div>
                            )}
                            <Campo
                              rotulo="Observação"
                              valor={item.observacao || ''}
                              onSalvar={(v) =>
                                salvarCampo(tabela, item.id, { observacao: v || null })
                              }
                            />
                          </div>

                          <div>
                            <p className="text-[10px] font-medium text-slate-500 mb-1.5">
                              Projetos ({h.projetos})
                            </p>

                            {Object.keys(h.tipos).length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-2">
                                {Object.entries(h.tipos)
                                  .sort((a, b) => b[1] - a[1])
                                  .map(([tipo, qtd]) => (
                                    <span
                                      key={tipo}
                                      className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${tipoColor(
                                        tipo
                                      )}`}
                                    >
                                      {tipo} {qtd}
                                    </span>
                                  ))}
                              </div>
                            )}

                            <div className="space-y-0.5 max-h-40 overflow-y-auto">
                              {h.ids.map((pid) => {
                                const p = projetos.find((x) => x.id === pid)
                                if (!p) return null
                                return (
                                  <button
                                    key={pid}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      onProjectClick?.(pid)
                                    }}
                                    className="w-full flex items-center gap-2 text-[11px] text-left px-1.5 py-1 rounded hover:bg-white"
                                  >
                                    <span className="text-slate-400 tabular-nums w-8">
                                      {p.numero ?? ''}
                                    </span>
                                    <span className="flex-1 truncate text-slate-700">{p.nome}</span>
                                    <span className="text-slate-400">{p.status}</span>
                                  </button>
                                )
                              })}
                              {h.ids.length === 0 && (
                                <p className="text-[11px] text-slate-400">
                                  Nenhum projeto vinculado ainda.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>

        {lista.length === 0 && (
          <p className="text-xs text-slate-400 py-6 text-center">Nada encontrado nesta busca.</p>
        )}
      </div>

      {aprovacoes.size === 0 && null}
    </div>
  )
}

/** Campo que grava ao sair, sem botão de salvar para esquecer de clicar. */
function Campo({
  rotulo,
  valor,
  onSalvar,
}: {
  rotulo: string
  valor: string
  onSalvar: (v: string) => void
}) {
  return (
    <label className="block flex-1">
      <span className="block text-[10px] font-medium text-slate-500 mb-0.5">{rotulo}</span>
      <input
        defaultValue={valor}
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => {
          if (e.target.value.trim() !== valor) onSalvar(e.target.value.trim())
        }}
        className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs"
      />
    </label>
  )
}
