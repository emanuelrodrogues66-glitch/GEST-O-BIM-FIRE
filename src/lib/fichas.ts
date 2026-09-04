import { useEffect, useState } from 'react'
import { carregarTabelaCompleta } from './supabase'

/**
 * Cliente e parceiro de cada projeto, para quem está olhando o quadro.
 *
 * Os dois vivem na ficha do projeto, uma aba adentro do cartão. Isso serve
 * enquanto se está trabalhando num projeto, mas atrapalha quando a pergunta é
 * "de quem são estes projetos" — que é a pergunta do Kanban e da lista. Um
 * mapa carregado uma vez responde isso sem abrir cartão nenhum.
 */

export type FichaResumo = { cliente: string | null; parceiro: string | null }

type Linha = {
  project_id: string
  nome_responsavel: string | null
  nome_parceiro: string | null
}

/** "SEM PARCEIRO" e "-" são preenchimento, não nome: não vale mostrar. */
function limpo(v: string | null): string | null {
  const t = (v || '').trim()
  if (!t || t === '-' || t === '--' || t.toLowerCase() === 'sem parceiro') return null
  return t
}

export function useFichas(): Map<string, FichaResumo> {
  const [fichas, setFichas] = useState<Map<string, FichaResumo>>(new Map())

  useEffect(() => {
    let ativo = true
    carregarTabelaCompleta<Linha>(
      'project_clients',
      'project_id, nome_responsavel, nome_parceiro'
    ).then((linhas) => {
      if (!ativo) return
      const mapa = new Map<string, FichaResumo>()
      for (const l of linhas) {
        mapa.set(l.project_id, {
          cliente: limpo(l.nome_responsavel),
          parceiro: limpo(l.nome_parceiro),
        })
      }
      setFichas(mapa)
    })
    return () => {
      ativo = false
    }
  }, [])

  return fichas
}
