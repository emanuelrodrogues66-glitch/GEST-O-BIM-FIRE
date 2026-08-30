import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Papel, UserProfile } from '../lib/perfil'
import { PAPEIS, rotuloDoPapel, usePerfil } from '../lib/perfil'

type Perfil = UserProfile & { updated_at: string | null }

function formatarData(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('pt-BR')
}

const CORES_PAPEL: Record<string, string> = {
  proprietario: 'bg-violet-100 text-violet-800 border-violet-300',
  admin: 'bg-amber-100 text-amber-800 border-amber-300',
  projetista: 'bg-slate-100 text-slate-600 border-slate-300',
}

/**
 * Gestão de permissões.
 *
 * Só o proprietário abre — e o bloqueio real está na policy do banco: um admin
 * que tentasse alterar papel por fora da tela levaria recusa do Postgres.
 *
 * O papel do proprietário é fixo no e-mail e protegido por gatilho: nem por SQL
 * ele pode ser rebaixado, para não existir a possibilidade de o dono perder o
 * acesso ao próprio sistema.
 */
export default function PermissionsView() {
  const { ehProprietario, carregando: carregandoPerfil, perfil } = usePerfil()
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (ehProprietario) carregar()
    else setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ehProprietario])

  async function carregar() {
    setCarregando(true)
    const { data, error } = await supabase
      .from('user_profiles')
      .select('user_id, email, nome, papel, updated_at')
      .order('email')
    if (error) setErro(error.message)
    setPerfis((data as Perfil[]) || [])
    setCarregando(false)
  }

  async function mudarPapel(p: Perfil, papel: Papel) {
    if (p.papel === papel) return
    if (
      !confirm(
        `Mudar ${p.email} de ${rotuloDoPapel(p.papel)} para ${rotuloDoPapel(papel)}?` +
          (papel === 'admin'
            ? '\n\nComo administrador, essa pessoa passa a ver salários, valores de contrato e margem de todos os projetos.'
            : '')
      )
    )
      return

    setSalvando(p.user_id)
    setErro('')
    const { error } = await supabase
      .from('user_profiles')
      .update({ papel, updated_at: new Date().toISOString() })
      .eq('user_id', p.user_id)
    setSalvando(null)
    if (error) {
      setErro(error.message)
      return
    }
    carregar()
  }

  async function salvarNome(p: Perfil, nome: string) {
    if ((p.nome || '') === nome.trim()) return
    await supabase
      .from('user_profiles')
      .update({ nome: nome.trim() || null, updated_at: new Date().toISOString() })
      .eq('user_id', p.user_id)
    carregar()
  }

  if (carregandoPerfil || carregando) {
    return <p className="text-sm text-slate-400 text-center py-10">Carregando...</p>
  }

  if (!ehProprietario) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <p className="text-3xl mb-2">🔒</p>
        <p className="text-sm font-medium text-slate-700">Área do proprietário</p>
        <p className="text-xs text-slate-500 mt-1">
          A gestão de permissões é exclusiva do dono do escritório. Você está como{' '}
          <b>{rotuloDoPapel(perfil?.papel || 'projetista')}</b>.
        </p>
      </div>
    )
  }

  const admins = perfis.filter((p) => p.papel === 'admin' || p.papel === 'proprietario')

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
        <p className="text-xs text-violet-900">
          <b>Só você abre esta tela.</b> A regra está no banco de dados: um administrador que
          tentasse mudar papel por fora do sistema levaria recusa. Seu próprio papel é fixo no
          e-mail e não pode ser alterado por ninguém — nem por você, de propósito, para não existir
          a chance de você se trancar do lado de fora.
        </p>
      </div>

      {erro && <p className="text-xs text-red-600">{erro}</p>}

      {/* ---------- O que cada papel pode ---------- */}
      <div className="grid md:grid-cols-3 gap-2">
        {PAPEIS.map((p) => (
          <div key={p.valor} className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
            <span
              className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded border mb-1 ${
                CORES_PAPEL[p.valor]
              }`}
            >
              {p.rotulo}
            </span>
            <p className="text-[11px] text-slate-600 leading-snug">{p.descricao}</p>
          </div>
        ))}
      </div>

      {/* ---------- Lista de contas ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-800">Contas com acesso</h3>
          <span className="text-[11px] text-slate-500">
            {perfis.length} conta{perfis.length === 1 ? '' : 's'} · {admins.length} com acesso ao
            financeiro
          </span>
        </div>

        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-200">
              <th className="text-left py-1.5">E-mail</th>
              <th className="text-left">Nome</th>
              <th className="text-left">Papel</th>
              <th className="text-right">Alterado em</th>
            </tr>
          </thead>
          <tbody>
            {perfis.map((p) => {
              const eDono = p.papel === 'proprietario'
              return (
                <tr key={p.user_id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 font-medium text-slate-800">{p.email}</td>
                  <td>
                    <input
                      defaultValue={p.nome || ''}
                      onBlur={(e) => salvarNome(p, e.target.value)}
                      placeholder="—"
                      className="w-28 border border-transparent hover:border-slate-200 focus:border-slate-300 rounded px-1 py-0.5 text-xs"
                    />
                  </td>
                  <td>
                    {eDono ? (
                      <span
                        className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded border ${CORES_PAPEL.proprietario}`}
                        title="Fixo no e-mail do dono, não pode ser alterado"
                      >
                        Proprietário 🔒
                      </span>
                    ) : (
                      <select
                        value={p.papel}
                        disabled={salvando === p.user_id}
                        onChange={(e) => mudarPapel(p, e.target.value as Papel)}
                        className={`text-[11px] font-medium px-1.5 py-1 rounded border cursor-pointer ${
                          CORES_PAPEL[p.papel] || ''
                        }`}
                      >
                        {PAPEIS.filter((x) => x.valor !== 'proprietario').map((x) => (
                          <option key={x.valor} value={x.valor}>
                            {x.rotulo}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="text-right text-slate-400 tabular-nums">
                    {formatarData(p.updated_at)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-slate-400">
        Contas novas entram como <b>Projetista</b>. Para tirar o acesso de alguém por completo, é
        preciso apagar a conta no painel do Supabase — daqui só dá para rebaixar o papel, que já
        remove o acesso a salário, valor de contrato e margem.
      </p>
    </div>
  )
}
