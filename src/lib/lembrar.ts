import { useEffect, useState } from 'react'

/**
 * Um `useState` que lembra onde a pessoa estava.
 *
 * Serve para as escolhas de navegação — qual aba, qual categoria, qual funil.
 * Celular e navegador descartam a aba quando fica um tempo em segundo plano;
 * ao voltar, a página carrega de novo do zero e quem estava no meio do
 * trabalho cai no Kanban do começo. Guardando essas escolhas, voltar é voltar
 * para o mesmo lugar.
 *
 * Só para preferência de tela: nada de dado de negócio, que mora no banco.
 */
export function useLembrado<T>(chave: string, inicial: T) {
  const [valor, setValor] = useState<T>(() => {
    try {
      const guardado = localStorage.getItem(`bimfire:${chave}`)
      return guardado === null ? inicial : (JSON.parse(guardado) as T)
    } catch {
      // Navegador com armazenamento bloqueado: segue sem lembrar.
      return inicial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(`bimfire:${chave}`, JSON.stringify(valor))
    } catch {
      /* sem espaço ou sem permissão: não é motivo para quebrar a tela */
    }
  }, [chave, valor])

  return [valor, setValor] as const
}
