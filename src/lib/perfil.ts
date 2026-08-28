import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Papéis, do mais alto para o mais baixo.
 *
 * `proprietario` existe acima de `admin` para que o dono do escritório não
 * possa ser rebaixado por outro administrador — nem por engano.
 */
export type Papel = 'proprietario' | 'admin' | 'projetista'

export const PAPEIS: { valor: Papel; rotulo: string; descricao: string }[] = [
  {
    valor: 'proprietario',
    rotulo: 'Proprietário',
    descricao: 'Tudo, mais a gestão de permissões. Fixo no e-mail do dono.',
  },
  {
    valor: 'admin',
    rotulo: 'Administrador',
    descricao: 'Vê salários, valores e margem. Altera pontos, datas travadas e apaga projeto.',
  },
  {
    valor: 'projetista',
    rotulo: 'Projetista',
    descricao: 'Trabalha nos projetos e tarefas. Não vê nada de dinheiro.',
  },
]

export function rotuloDoPapel(p: string): string {
  return PAPEIS.find((x) => x.valor === p)?.rotulo || p
}

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

  const ehProprietario = perfil?.papel === 'proprietario'

  return {
    perfil,
    // Proprietário é admin também: senão perderia as telas financeiras.
    ehAdmin: ehProprietario || perfil?.papel === 'admin',
    ehProprietario,
    carregando,
  }
}
