import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import { useLembrado } from '../lib/lembrar'
import { usePermissoes } from '../lib/permissoes'
import { LOGO_MEF_PNG } from '../lib/logoMef'
import Login from './Login'
import MefProdutos from './MefProdutos'
import MefOrcamentos from './MefOrcamentos'
import MefFinanceiro from './MefFinanceiro'

type Aba = 'orcamentos' | 'financeiro' | 'produtos'

const ABAS: [Aba, string][] = [
  ['orcamentos', 'Orçamentos'],
  ['financeiro', 'Financeiro'],
  ['produtos', 'Catálogo'],
]

/**
 * MEF — instalação e manutenção.
 *
 * Endereço próprio, como o ponto e o comercial: quem passa o dia orçando abre
 * direto aqui, sem carregar o quadro de projetos junto. O login e o cadastro
 * de clientes são os mesmos da BIM Fire.
 */
export default function MefPage() {
  const session = useSessao()
  const { pode, carregando: carregandoPerm } = usePermissoes()
  const [aba, setAba] = useLembrado<Aba>('mef-aba', 'orcamentos')

  if (session === undefined || carregandoPerm) {
    return <p className="text-sm text-slate-400 text-center py-20">Carregando...</p>
  }
  if (!session) return <Login />
  if (!pode('mef.ver')) {
    return (
      <div className="min-h-screen bg-[#F7F6F5] flex items-center justify-center">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm py-12 px-8 text-center">
          <p className="text-3xl mb-2">🔒</p>
          <p className="text-sm text-slate-600">Seu perfil não tem acesso à MEF.</p>
          <a href="/" className="text-xs text-indigo-700 hover:underline mt-2 inline-block">
            Voltar para a gestão de projetos
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F7F6F5]">
      <header className="bg-carvao-900 text-white">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center gap-3">
          <img
            src={LOGO_MEF_PNG}
            alt="MEF"
            className="h-9 w-auto rounded bg-white px-1 py-0.5 object-contain"
          />
          <div className="flex-1">
            <h1 className="text-sm font-semibold leading-tight">MEF</h1>
            <p className="text-[11px] text-white/50 leading-tight">Instalação e manutenção</p>
          </div>
          <a
            href="/"
            className="text-[11px] text-white/70 hover:text-white px-2.5 py-1.5 rounded-lg border border-white/20"
          >
            Gestão de Projetos
          </a>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-[11px] text-white/60 hover:text-white"
          >
            Sair
          </button>
        </div>
      </header>

      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-4 flex gap-1">
          {ABAS.filter((par) => par[0] !== 'financeiro' || pode('mef.financeiro.ver')).map((par) => (
            <button
              key={par[0]}
              onClick={() => setAba(par[0])}
              className={
                'text-xs font-medium px-3 py-2.5 border-b-2 ' +
                (aba === par[0]
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700')
              }
            >
              {par[1]}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-[1600px] mx-auto px-4 py-4">
        {aba === 'orcamentos' ? (
          <MefOrcamentos />
        ) : aba === 'financeiro' ? (
          <MefFinanceiro />
        ) : (
          <MefProdutos />
        )}
      </main>
    </div>
  )
}
