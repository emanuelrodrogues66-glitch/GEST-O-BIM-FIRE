import { useEffect, useMemo, useState } from 'react'
import type { Fornecedor } from '../lib/fornecedores'
import {
  CORES_FORNECEDOR,
  ESTADOS,
  SITUACOES_FORNECEDOR,
  TIPOS_DE_PROJETO,
  carregarFornecedores,
  mudarFornecedor,
  telefoneBonito,
  virarParceiro,
} from '../lib/fornecedores'

/**
 * Quem se ofereceu para trabalhar com a gente.
 *
 * Fica separado do cadastro de parceiros de propósito: aqui é a fila de quem
 * se apresentou, com o que a pessoa escreveu. Vira parceiro de verdade só
 * quando alguém olha e aprova.
 */
export default function Fornecedores({ podeEditar }: { podeEditar: boolean }) {
  const [lista, setLista] = useState<Fornecedor[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [uf, setUf] = useState('')
  const [tipo, setTipo] = useState('')
  const [situacao, setSituacao] = useState('')
  const [aviso, setAviso] = useState('')

  async function carregar() {
    try {
      setLista(await carregarFornecedores())
    } catch (e) {
      console.error(e)
      setAviso('Não deu para carregar a lista.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return lista.filter((f) => {
      if (uf && f.estado !== uf) return false
      if (situacao && f.situacao !== situacao) return false
      if (tipo && !(f.tipos_projeto || []).some((x) => x.toLowerCase().includes(tipo.toLowerCase())))
        return false
      if (!t) return true
      return [f.nome, f.profissao, f.cidade, f.email, f.telefone, (f.tipos_projeto || []).join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(t)
    })
  }, [lista, busca, uf, tipo, situacao])

  async function mudar(f: Fornecedor, patch: Partial<Fornecedor>) {
    setLista(lista.map((x) => (x.id === f.id ? { ...x, ...patch } : x)))
    try {
      await mudarFornecedor(f.id, patch)
    } catch (e) {
      console.error(e)
      setAviso('Não deu para salvar.')
      carregar()
    }
  }

  async function aprovar(f: Fornecedor) {
    try {
      await virarParceiro(f.id)
      setAviso(f.nome + ' entrou no cadastro de parceiros.')
      await carregar()
    } catch (e) {
      console.error(e)
      setAviso('Não deu para aprovar: ' + (e as Error).message)
    }
  }

  const porSituacao = (s: string) => lista.filter((f) => f.situacao === s).length

  if (carregando) return <p className="text-sm text-slate-400 text-center py-20">Carregando...</p>

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-slate-600 mb-1">Link do formulário</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="text-xs bg-slate-100 rounded-lg px-2.5 py-1.5 text-slate-700">
            {window.location.origin}/parceiro
          </code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(window.location.origin + '/parceiro')
              setAviso('Link copiado.')
            }}
            className="text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50"
          >
            Copiar
          </button>
          <span className="text-[11px] text-slate-400">
            é esse endereço que você manda no WhatsApp
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          ['Cadastrados', lista.length],
          ['Novos', porSituacao('novo')],
          ['Avaliando', porSituacao('avaliando')],
          ['Aprovados', porSituacao('aprovado')],
          ['Já trabalharam', lista.filter((f) => f.ja_trabalhou === 'Sim').length],
        ].map(([r, v]) => (
          <div key={String(r)} className="bg-white border border-slate-200 rounded-xl px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">{r}</p>
            <p className="text-lg font-semibold text-slate-700">{v}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar nome, cidade, e-mail..."
          className="flex-1 min-w-[12rem] text-xs border border-slate-300 rounded-lg px-3 py-2"
        />
        <select
          value={uf}
          onChange={(e) => setUf(e.target.value)}
          className="text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
        >
          <option value="">Todos os estados</option>
          {ESTADOS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
        >
          <option value="">Todo tipo de projeto</option>
          {TIPOS_DE_PROJETO.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={situacao}
          onChange={(e) => setSituacao(e.target.value)}
          className="text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
        >
          <option value="">Toda situação</option>
          {Object.entries(SITUACOES_FORNECEDOR).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-slate-400">{filtrados.length} na lista</span>
      </div>

      {aviso && (
        <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
          {aviso}
        </p>
      )}

      <div className="space-y-2">
        {!filtrados.length && (
          <p className="text-xs text-slate-400 text-center py-10">Nada com esses filtros.</p>
        )}
        {filtrados.map((f) => (
          <div key={f.id} className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="flex flex-wrap items-start gap-2">
              <div className="flex-1 min-w-[14rem]">
                <p className="text-sm font-medium text-slate-700">
                  {f.nome}
                  <span
                    className={
                      'ml-2 px-2 py-0.5 rounded-full text-[10px] ' +
                      (CORES_FORNECEDOR[f.situacao] || CORES_FORNECEDOR.novo)
                    }
                  >
                    {SITUACOES_FORNECEDOR[f.situacao] || f.situacao}
                  </span>
                  {f.parceiro_id && (
                    <span className="ml-1 text-[10px] text-emerald-600">no cadastro</span>
                  )}
                </p>
                <p className="text-[11px] text-slate-500">
                  {f.profissao}
                  {f.cidade ? ' · ' + f.cidade : ''}
                  {f.estado ? ' — ' + f.estado : ''}
                  {f.ja_trabalhou ? ' · ' + f.ja_trabalhou : ''}
                </p>
                {f.tipos_projeto && f.tipos_projeto.length > 0 && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {f.tipos_projeto.join(' · ')}
                  </p>
                )}
                {f.comentarios && (
                  <p className="text-[11px] text-slate-500 mt-1 italic">{f.comentarios}</p>
                )}
              </div>

              <div className="text-right">
                {f.telefone && (
                  <a
                    href={'https://wa.me/55' + f.telefone}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-xs text-emerald-700 hover:underline"
                  >
                    {telefoneBonito(f.telefone)}
                  </a>
                )}
                {f.email && <p className="text-[11px] text-slate-400">{f.email}</p>}
              </div>
            </div>

            {podeEditar && (
              <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-slate-100">
                <select
                  value={f.situacao}
                  onChange={(e) => mudar(f, { situacao: e.target.value })}
                  className="text-[11px] border border-slate-300 rounded-lg px-2 py-1 bg-white"
                >
                  {Object.entries(SITUACOES_FORNECEDOR).map(([v, r]) => (
                    <option key={v} value={v}>
                      {r}
                    </option>
                  ))}
                </select>
                {!f.parceiro_id && (
                  <button
                    onClick={() => aprovar(f)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-600 text-white"
                  >
                    Virar parceiro
                  </button>
                )}
                <input
                  defaultValue={f.observacao_interna || ''}
                  onBlur={(e) => {
                    if (e.target.value !== (f.observacao_interna || '')) {
                      mudar(f, { observacao_interna: e.target.value })
                    }
                  }}
                  placeholder="Anotação interna"
                  className="flex-1 min-w-[10rem] text-[11px] border border-slate-200 rounded-lg px-2 py-1"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
