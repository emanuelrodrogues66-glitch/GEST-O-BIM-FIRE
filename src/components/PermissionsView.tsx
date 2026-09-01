import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Excecao, PerfilDeAcesso } from '../lib/permissoes'
import {
  GRUPOS,
  PERMISSOES,
  carregarExcecoes,
  carregarPerfis,
  carregarPermissoesDosPerfis,
  criarPerfil,
  definirExcecao,
  definirPerfilDoUsuario,
  definirPermissaoDoPerfil,
  excluirPerfil,
  usePermissoes,
} from '../lib/permissoes'

type Usuario = { user_id: string; email: string; nome: string | null; papel: string; role_id: string | null }

/**
 * Permissões.
 *
 * Duas telas porque são duas perguntas diferentes: "o que este cargo pode
 * fazer" e "esta pessoa aqui tem alguma exceção". Misturar as duas foi o que
 * fez os três papéis fixos não darem conta.
 */
export default function PermissionsView() {
  const { pode, carregando: carregandoPerm } = usePermissoes()
  const [aba, setAba] = useState<'perfis' | 'pessoas'>('perfis')

  const [perfis, setPerfis] = useState<PerfilDeAcesso[]>([])
  const [doPerfil, setDoPerfil] = useState<Map<string, Set<string>>>(new Map())
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [excecoes, setExcecoes] = useState<Excecao[]>([])
  const [carregando, setCarregando] = useState(true)

  const podeGerenciar = pode('permissoes.gerenciar')

  useEffect(() => {
    if (!carregandoPerm && podeGerenciar) carregar()
    else if (!carregandoPerm) setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregandoPerm, podeGerenciar])

  async function carregar() {
    setCarregando(true)
    const [p, dp, ex, { data: us }] = await Promise.all([
      carregarPerfis(),
      carregarPermissoesDosPerfis(),
      carregarExcecoes(),
      supabase.from('user_profiles').select('user_id, email, nome, papel, role_id').order('email'),
    ])
    setPerfis(p)
    setDoPerfil(dp)
    setExcecoes(ex)
    setUsuarios((us as Usuario[]) || [])
    setCarregando(false)
  }

  if (carregandoPerm || carregando) {
    return <p className="text-sm text-slate-400 text-center py-10">Carregando...</p>
  }

  if (!podeGerenciar) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm py-12 text-center max-w-lg mx-auto">
        <p className="text-3xl mb-2">🔒</p>
        <p className="text-sm text-slate-600">Esta área é de quem gerencia permissões.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {(
          [
            ['perfis', 'Perfis e o que cada um pode'],
            ['pessoas', 'Pessoas e exceções'],
          ] as const
        ).map(([v, rotulo]) => (
          <button
            key={v}
            onClick={() => setAba(v)}
            className={`text-[11px] font-medium px-3 py-1.5 rounded-md transition ${
              aba === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === 'perfis' && (
        <Perfis perfis={perfis} doPerfil={doPerfil} onMudou={carregar} />
      )}
      {aba === 'pessoas' && (
        <Pessoas
          perfis={perfis}
          doPerfil={doPerfil}
          usuarios={usuarios}
          excecoes={excecoes}
          onMudou={carregar}
        />
      )}

      <p className="text-[10px] text-slate-400">
        A restrição vale no banco de dados, não só na tela: quem não tem a permissão não consegue
        nem baixar o dado. O proprietário passa por tudo — é o que impede o dono do escritório de se
        trancar para fora por engano.
      </p>
    </div>
  )
}

// ============================================================ perfis

function Perfis({
  perfis,
  doPerfil,
  onMudou,
}: {
  perfis: PerfilDeAcesso[]
  doPerfil: Map<string, Set<string>>
  onMudou: () => void
}) {
  const [selecionado, setSelecionado] = useState<string>(perfis[0]?.id || '')
  const [salvando, setSalvando] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')

  const perfil = perfis.find((p) => p.id === selecionado) || perfis[0]
  const marcadas = doPerfil.get(perfil?.id || '') || new Set<string>()
  const dono = perfil?.nome === 'Proprietário'

  async function alternar(codigo: string, ligada: boolean) {
    if (!perfil) return
    setSalvando(codigo)
    try {
      await definirPermissaoDoPerfil(perfil.id, codigo, ligada)
      onMudou()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSalvando(null)
    }
  }

  async function novo() {
    if (!nome.trim()) return
    try {
      const p = await criarPerfil(nome, descricao)
      setNome('')
      setDescricao('')
      setCriando(false)
      setSelecionado(p.id)
      onMudou()
    } catch (e: any) {
      alert(e.message)
    }
  }

  async function apagar() {
    if (!perfil || perfil.sistema) return
    if (!confirm(`Apagar o perfil "${perfil.nome}"?`)) return
    try {
      await excluirPerfil(perfil.id)
      setSelecionado(perfis[0]?.id || '')
      onMudou()
    } catch (e: any) {
      alert(e.message)
    }
  }

  return (
    <div className="grid md:grid-cols-[220px_1fr] gap-4">
      {/* ---------- lista de perfis ---------- */}
      <div className="space-y-2">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {perfis.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelecionado(p.id)}
              className={`w-full text-left px-3 py-2 border-b border-slate-100 last:border-0 transition ${
                p.id === perfil?.id ? 'bg-indigo-50' : 'hover:bg-slate-50'
              }`}
            >
              <p className="text-xs font-medium text-slate-800">{p.nome}</p>
              <p className="text-[10px] text-slate-400">
                {p.nome === 'Proprietário'
                  ? 'todas as permissões'
                  : `${(doPerfil.get(p.id) || new Set()).size} permissões`}
              </p>
            </button>
          ))}
        </div>

        {criando ? (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 space-y-2">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do perfil"
              className="w-full text-xs border border-slate-300 rounded-md px-2 py-1.5"
            />
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Para que serve"
              className="w-full text-xs border border-slate-300 rounded-md px-2 py-1.5"
            />
            <div className="flex gap-1.5">
              <button
                onClick={() => setCriando(false)}
                className="flex-1 text-[11px] px-2 py-1.5 rounded-md border border-slate-300 text-slate-600"
              >
                Cancelar
              </button>
              <button
                onClick={novo}
                className="flex-1 text-[11px] px-2 py-1.5 rounded-md bg-indigo-600 text-white font-medium"
              >
                Criar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setCriando(true)}
            className="w-full text-[11px] font-medium px-3 py-2 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700"
          >
            + Novo perfil
          </button>
        )}
      </div>

      {/* ---------- permissões do perfil ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-start gap-3">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-800">{perfil?.nome}</h3>
            <p className="text-[11px] text-slate-500">{perfil?.descricao}</p>
          </div>
          {perfil && !perfil.sistema && (
            <button onClick={apagar} className="text-[11px] text-red-600 hover:underline">
              apagar perfil
            </button>
          )}
        </div>

        {dono ? (
          <p className="px-4 py-8 text-center text-xs text-slate-500">
            O proprietário tem tudo por definição. Não há o que marcar aqui — e é de propósito:
            é a garantia de que sempre existe alguém capaz de devolver acesso aos outros.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {GRUPOS.map((grupo) => (
              <div key={grupo} className="px-4 py-3">
                <p className="text-[10px] font-semibold uppercase text-slate-400 mb-2">{grupo}</p>
                <div className="space-y-1.5">
                  {PERMISSOES.filter((p) => p.grupo === grupo).map((p) => (
                    <label
                      key={p.codigo}
                      className="flex items-start gap-2 cursor-pointer group"
                    >
                      <input
                        type="checkbox"
                        checked={marcadas.has(p.codigo)}
                        disabled={salvando === p.codigo}
                        onChange={(e) => alternar(p.codigo, e.target.checked)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span
                          className={`text-xs font-medium ${
                            p.sensivel ? 'text-amber-800' : 'text-slate-700'
                          }`}
                        >
                          {p.rotulo}
                          {p.sensivel && <span className="ml-1 text-[9px]">⚠</span>}
                        </span>
                        <span className="block text-[10px] text-slate-400 leading-snug">
                          {p.descricao}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================ pessoas

function Pessoas({
  perfis,
  doPerfil,
  usuarios,
  excecoes,
  onMudou,
}: {
  perfis: PerfilDeAcesso[]
  doPerfil: Map<string, Set<string>>
  usuarios: Usuario[]
  excecoes: Excecao[]
  onMudou: () => void
}) {
  const [aberto, setAberto] = useState<string | null>(null)

  const porUsuario = useMemo(() => {
    const mapa = new Map<string, Map<string, boolean>>()
    for (const e of excecoes) {
      if (!mapa.has(e.user_id)) mapa.set(e.user_id, new Map())
      mapa.get(e.user_id)!.set(e.permissao, e.concedida)
    }
    return mapa
  }, [excecoes])

  async function trocarPerfil(u: Usuario, roleId: string) {
    try {
      await definirPerfilDoUsuario(u.user_id, roleId)
      onMudou()
    } catch (e: any) {
      alert(e.message)
    }
  }

  async function mudarExcecao(u: Usuario, codigo: string, valor: boolean | null) {
    try {
      await definirExcecao(u.user_id, codigo, valor)
      onMudou()
    } catch (e: any) {
      alert(e.message)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {usuarios.map((u) => {
        const excecoesDele = porUsuario.get(u.user_id) || new Map<string, boolean>()
        const doSeuPerfil = doPerfil.get(u.role_id || '') || new Set<string>()
        const dono = u.papel === 'proprietario'
        const expandido = aberto === u.user_id

        return (
          <div key={u.user_id} className="border-b border-slate-100 last:border-0">
            <div className="px-4 py-3 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-800 truncate">
                  {u.nome || u.email.split('@')[0]}
                </p>
                <p className="text-[10px] text-slate-400 truncate">{u.email}</p>
              </div>

              {dono ? (
                <span className="text-[11px] font-medium text-indigo-700">
                  Proprietário · acesso total
                </span>
              ) : (
                <select
                  value={u.role_id || ''}
                  onChange={(e) => trocarPerfil(u, e.target.value)}
                  className="text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white"
                >
                  <option value="">Sem perfil</option>
                  {perfis
                    .filter((p) => p.nome !== 'Proprietário')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                </select>
              )}

              {!dono && (
                <button
                  onClick={() => setAberto(expandido ? null : u.user_id)}
                  className="text-[11px] text-slate-500 hover:underline"
                >
                  {excecoesDele.size > 0 ? `${excecoesDele.size} exceção(ões)` : 'exceções'}
                </button>
              )}
            </div>

            {expandido && !dono && (
              <div className="px-4 pb-3 bg-slate-50/60">
                <p className="text-[10px] text-slate-500 mb-2">
                  "Pelo perfil" é o normal. Use <strong>Liberar</strong> ou <strong>Bloquear</strong>{' '}
                  só quando esta pessoa precisar fugir do perfil dela.
                </p>
                <div className="space-y-1">
                  {PERMISSOES.map((p) => {
                    const excecao = excecoesDele.get(p.codigo)
                    const efetiva = excecao ?? doSeuPerfil.has(p.codigo)
                    return (
                      <div key={p.codigo} className="flex items-center gap-2">
                        <span
                          className={`text-[11px] flex-1 min-w-0 truncate ${
                            efetiva ? 'text-slate-700' : 'text-slate-400'
                          }`}
                          title={p.descricao}
                        >
                          {p.rotulo}
                          {p.sensivel && <span className="ml-1 text-amber-600 text-[9px]">⚠</span>}
                        </span>
                        <div className="flex gap-0.5 shrink-0">
                          {(
                            [
                              [null, 'Pelo perfil'],
                              [true, 'Liberar'],
                              [false, 'Bloquear'],
                            ] as [boolean | null, string][]
                          ).map(([valor, rotulo]) => {
                            const ativo = excecao === undefined ? valor === null : excecao === valor
                            return (
                              <button
                                key={rotulo}
                                onClick={() => mudarExcecao(u, p.codigo, valor)}
                                className={`text-[10px] px-1.5 py-0.5 rounded border transition ${
                                  ativo
                                    ? valor === true
                                      ? 'bg-emerald-600 text-white border-transparent'
                                      : valor === false
                                        ? 'bg-red-600 text-white border-transparent'
                                        : 'bg-slate-700 text-white border-transparent'
                                    : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400'
                                }`}
                              >
                                {rotulo}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
