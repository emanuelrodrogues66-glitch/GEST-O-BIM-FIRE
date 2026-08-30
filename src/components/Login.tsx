import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { LOGO_BIM_FIRE_JPEG } from '../lib/logoBimFire'

type Mode = 'login' | 'signup' | 'recuperar'

export default function Login() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nome, setNome] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  function trocarModo(novo: Mode) {
    setMode(novo)
    setError(null)
    setInfo(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { nome: nome || email.split('@')[0] } },
        })
        if (error) throw error
        setInfo(
          'Conta criada! Se a confirmação de e-mail estiver ativa, verifique sua caixa de entrada. Caso contrário, já pode entrar.'
        )
      } else {
        // Recuperação: o link do e-mail volta para a própria tela do app,
        // onde o Supabase abre uma sessão de recuperação e o usuário
        // define a nova senha.
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        })
        if (error) throw error
        setInfo(
          'Se este e-mail estiver cadastrado, o link de redefinição chegou na caixa de entrada. Confira também o spam.'
        )
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao autenticar')
    } finally {
      setLoading(false)
    }
  }

  const titulo =
    mode === 'login'
      ? 'Entre com sua conta da equipe'
      : mode === 'signup'
        ? 'Crie sua conta de acesso'
        : 'Enviaremos um link para você criar uma senha nova'

  const rotuloBotao =
    mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link de recuperação'

  return (
    <div className="min-h-screen flex items-center justify-center bg-carvao-900 px-4 relative overflow-hidden">
      {/* Duas manchas da marca ao fundo: dão identidade sem competir com o
          formulário, que continua sendo a única coisa clara da tela. */}
      <div
        className="absolute rounded-full bg-indigo-600/25 blur-3xl pointer-events-none"
        style={{ width: 520, height: 520, top: -160, right: -140 }}
      />
      <div
        className="absolute rounded-full bg-cobre-500/20 blur-3xl pointer-events-none"
        style={{ width: 380, height: 380, bottom: -120, left: -100 }}
      />

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-white/10 p-8 relative">
        <div className="flex items-center gap-3 mb-5">
          <img
            src={LOGO_BIM_FIRE_JPEG}
            alt="BIM Fire"
            className="w-12 h-12 rounded-xl object-cover shrink-0"
          />
          <div>
            <h1 className="text-lg font-semibold text-slate-800 leading-tight">
              Gestão de Projetos
            </h1>
            <p className="text-[11px] font-semibold text-indigo-600 tracking-widest">BIM FIRE</p>
          </div>
        </div>
        <p className="text-sm text-slate-500 mb-6">{titulo}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-sm text-slate-600 mb-1">Nome</label>
              <input
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Seu nome"
              />
            </div>
          )}
          <div>
            <label className="block text-sm text-slate-600 mb-1">E-mail</label>
            <input
              type="email"
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com"
            />
          </div>
          {mode !== 'recuperar' && (
            <div>
              <label className="block text-sm text-slate-600 mb-1">Senha</label>
              <input
                type="password"
                required
                minLength={6}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-emerald-600">{info}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 transition"
          >
            {loading ? 'Aguarde...' : rotuloBotao}
          </button>
        </form>

        {mode === 'login' && (
          <button
            className="mt-3 text-xs text-slate-500 hover:text-indigo-600 underline w-full text-center"
            onClick={() => trocarModo('recuperar')}
          >
            Esqueci minha senha
          </button>
        )}

        <button
          className="mt-3 text-xs text-slate-500 hover:text-indigo-600 underline w-full text-center"
          onClick={() => trocarModo(mode === 'login' ? 'signup' : 'login')}
        >
          {mode === 'login' ? 'Não tem conta? Criar uma agora' : 'Já tem conta? Entrar'}
        </button>
      </div>
    </div>
  )
}
