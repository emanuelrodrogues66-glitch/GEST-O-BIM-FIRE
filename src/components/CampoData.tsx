import { useEffect, useState } from 'react'

/**
 * Campo de data que só grava quando a data está completa.
 *
 * O input de data do navegador dispara a cada tecla. Digitando o ano, ele
 * manda "0002", depois "0020", "0202" e só então "2027" — e quem salva no
 * onChange tenta gravar as três primeiras. O banco recusa, aparece erro na
 * tela e o campo fica vazio: era esse o defeito no cronograma do TCAC.
 *
 * Aqui o valor fica local enquanto se digita e sobe só quando o campo perde o
 * foco, com o ano dentro de uma faixa que faz sentido. Enter confirma, Esc
 * desiste — porque quem está corrigindo uma data precisa poder voltar atrás
 * sem ter que lembrar o que estava escrito antes.
 */
export default function CampoData({
  valor,
  onSalvar,
  className = '',
  anoMin = 2000,
  anoMax = 2100,
  travado,
}: {
  valor: string | null
  onSalvar: (v: string | null) => void
  className?: string
  anoMin?: number
  anoMax?: number
  travado?: boolean
}) {
  const [texto, setTexto] = useState(valor || '')
  useEffect(() => setTexto(valor || ''), [valor])

  function confirmar() {
    const v = texto || null
    if (v === (valor || null)) return
    if (v !== null) {
      const ano = Number(v.slice(0, 4))
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || ano < anoMin || ano > anoMax) {
        setTexto(valor || '')
        return
      }
    }
    onSalvar(v)
  }

  return (
    <input
      type="date"
      value={texto}
      disabled={travado}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setTexto(valor || '')
      }}
      className={`border rounded px-1 py-0.5 disabled:bg-slate-50 ${className}`}
    />
  )
}
