import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { usePerfil } from '../lib/perfil'
import { LOGO_BIM_FIRE_JPEG } from '../lib/logoBimFire'
import Login from './Login'
import PontoBater from './PontoBater'
import PontoEspelho from './PontoEspelho'
import PontoAdmin from './PontoAdmin'

type Aba = 'bater' | 'espelho' | 'admin'

/**
 * Página do cartão ponto, em endereço próprio (/ponto).
 *
 * Fica fora do app de projetos de propósito: quem chega de manhã quer bater o
 * ponto e ir trabalhar, não atravessar um Kanban. Também dá para deixar aberta
 * num computador ou salvar no celular como atalho.
 */
export default function PontoPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [aba, setAba] = useState<Aba>('bater')
  const { ehAdmin, ehProprietario } = usePerfil()
  const podeAdministrar = ehAdmin || ehProprietario

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return <p className="text-sm text-slate-400 text-center py-20">Carregando...</p>
  }
  if (!session) return <Login />

  const abas: [Aba, string][] = [
    ['bater', 'Bater ponto'],
    ['espelho', 'Espelho do mês'],
  ]
  if (podeAdministrar) abas.push(['admin', 'Administração'])

  return (
    <div className="min-h-screen bg-[#F7F6F5]">
      <header className="bg-carvao-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src={LOGO_BIM_FIRE_JPEG} alt="BIM Fire" className="w-9 h-9 rounded-lg object-cover" />
          <div className="flex-1">
            <h1 className="text-sm font-semibold leading-tight">Cartão ponto</h1>
            <p className="text-[11px] text-white/50 leading-tight">BIM Fire</p>
          </div>
          <a
            href="/"
            className="text-[11px] text-white/70 hover:text-white px-2.5 py-1.5 rounded-lg border border-white/20"
          >
            Gestão de Projetos
          </a>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-[11px] text-white/70 hover:text-white"
          >
            Sair
          </button>
        </div>
      </header>

      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 flex gap-1">
          {abas.map(([v, rotulo]) => (
            <button
              key={v}
              onClick={() => setAba(v)}
              className={`text-xs font-medium px-3 py-2.5 border-b-2 transition ${
                aba === v
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-5">
        {aba === 'bater' && <PontoBater />}
        {aba === 'espelho' && <PontoEspelho podeAjustar={podeAdministrar} />}
        {aba === 'admin' && podeAdministrar && <PontoAdmin />}
      </main>
    </div>
  )
}
