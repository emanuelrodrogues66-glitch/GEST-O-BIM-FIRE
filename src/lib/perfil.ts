import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Papel = 'admin' | 'projetista'

export type UserProfile = {
  user_id: string
  email: string
  nome: string | null
  papel: Papel
}

/**
 * Perfil do usuário logado.
 *
 * O papel vem da tabela user_profiles. O bloqueio de verdade está no banco
 * (policy de exclusão + trigger na pontuação); aqui é só para a tela não
 * oferecer um botão que o servidor vai recusar.
 */
export function usePerfil() {
  const [perfil, setPerfil] = useState<UserProfile | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let ativo = true

    async function carregar() {
      const { data: sessao } = await supabase.auth.getUser()
      const id = sessao.user?.id
      if (!id) {
        if (ativo) {
          setPerfil(null)
          setCarregando(false)
        }
        return
      }

      const { data } = await supabase
        .from('user_profiles')
        .select('user_id, email, nome, papel')
        .eq('user_id', id)
        .maybeSingle()

      if (ativo) {
        setPerfil((data as UserProfile) || null)
        setCarregando(false)
      }
    }

    carregar()
    return () => {
      ativo = false
    }
  }, [])

  return { perfil, ehAdmin: perfil?.papel === 'admin', carregando }
}
