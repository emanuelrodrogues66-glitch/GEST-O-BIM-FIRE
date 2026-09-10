import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

/**
 * Quem está logado — sem trocar de objeto à toa.
 *
 * O supabase-js confere e renova o token toda vez que a aba volta a ficar
 * visível. Minimizar a janela e voltar já dispara `SIGNED_IN` e
 * `TOKEN_REFRESHED`. Se cada um desses eventos virasse um objeto novo no
 * estado do React, todo efeito que depende da sessão rodava de novo: a tela
 * recarregava do zero, o "Carregando..." voltava e a pessoa perdia o lugar
 * onde estava trabalhando — que era exatamente o que acontecia aqui.
 *
 * O token continua sendo renovado normalmente pelo cliente do supabase, que é
 * quem assina as requisições; nada disso passa por este estado. Aqui só
 * interessa QUEM está logado, então o objeto só é trocado quando muda a
 * pessoa: entrou, saiu, ou é outro usuário.
 *
 * `undefined` = ainda não sabemos. `null` = ninguém logado.
 */
export function useSessao(aoPedirNovaSenha?: () => void): Session | null | undefined {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined)
  // Guardado em ref para o efeito poder rodar uma vez só, sem depender da
  // identidade da função que o componente recria a cada render.
  const aviso = useRef(aoPedirNovaSenha)
  aviso.current = aoPedirNovaSenha

  useEffect(() => {
    let ativo = true

    function aplicar(nova: Session | null) {
      if (!ativo) return
      setSessao((atual) => {
        if (atual === undefined) return nova
        return (atual?.user.id ?? null) === (nova?.user.id ?? null) ? atual : nova
      })
    }

    supabase.auth.getSession().then(({ data }) => aplicar(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') aviso.current?.()
      aplicar(s)
    })

    return () => {
      ativo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return sessao
}
