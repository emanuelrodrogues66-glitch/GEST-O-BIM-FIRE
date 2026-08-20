import { useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Tela mostrada quando o usuário chega pelo link de recuperação de senha.
 * O Supabase já abriu uma sessão temporária; aqui ele só define a senha nova.
 */
export default function NovaSenha({
  onPronto,
  onCancelar,
}: {
  onPronto: () => void
  /** Presente quando a tela foi aberta pelo botão, não pelo link do e-mail. */
  onCancelar?: () => void
}) {
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (senha !== confirmacao) {
      setErro('As duas senhas não são iguais.')
      return
    }
    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setSalvando(false)
    if (error) {
      setErro(error.message)
      return
    }
    // Limpa o token de recuperação da barra de endereços para que um F5
    // não jogue o usuário de volta nesta tela.
    if (window.location.hash || window.location.search) {
      window.history.replaceState(null, '', window.location.pathname)
    }
    onPronto()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-xl font-semibold text-slate-800 mb-1">Definir nova senha</h1>
        <p className="text-sm text-slate-500 mb-6">
          Escolha uma senha de pelo menos 6 caracteres para voltar a acessar o sistema.
        </p>
        <form onSubmit={salvar} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Nova senha</label>
            <input
              type="password"
              required
              minLength={6}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Repita a nova senha</label>
            <input
              type="password"
              required
              minLength={6}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <button
            type="submit"
            disabled={salvando}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 transition"
          >
            {salvando ? 'Salvando...' : 'Salvar e entrar'}
          </button>
          {onCancelar && (
            <button
              type="button"
              onClick={onCancelar}
              className="w-full text-xs text-slate-500 hover:text-slate-700 underline"
            >
              Cancelar
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
