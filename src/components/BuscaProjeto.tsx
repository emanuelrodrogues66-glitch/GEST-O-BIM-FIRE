import { useEffect, useMemo, useRef, useState } from 'react'

export type ProjetoOpcao = { id: string; numero: number | null; nome: string }

/** Normaliza para busca: sem acento, sem caixa. */
function chave(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Escolha de projeto pelo nome.
 *
 * Uma lista suspensa com duzentos projetos obriga a procurar com o olho, e a
 * ordem é por número — que ninguém memoriza. Aqui se digita parte do nome (ou
 * o número, para quem o tem em mãos) e a lista encurta.
 */
export default function BuscaProjeto({
  projetos,
  valor,
  onEscolher,
  placeholder,
  permitirVazio,
}: {
  projetos: ProjetoOpcao[]
  valor: string
  onEscolher: (id: string) => void
  placeholder?: string
  /** Em tarefa recorrente, ficar sem projeto é uma escolha válida. */
  permitirVazio?: boolean
}) {
  const escolhido = projetos.find((p) => p.id === valor) || null
  const [texto, setTexto] = useState('')
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  // Clicar fora fecha a lista sem desfazer o que já estava escolhido.
  useEffect(() => {
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  const achados = useMemo(() => {
    const q = chave(texto)
    const lista = q
      ? projetos.filter((p) => chave((p.numero ? p.numero + ' ' : '') + p.nome).includes(q))
      : projetos
    return lista.slice(0, 40)
  }, [projetos, texto])

  function rotulo(p: ProjetoOpcao) {
    return (p.numero ? p.numero + ' · ' : '') + p.nome
  }

  return (
    <div className="relative flex-1 min-w-[180px]" ref={caixa}>
      <input
        value={aberto ? texto : escolhido ? rotulo(escolhido) : ''}
        onChange={(e) => {
          setTexto(e.target.value)
          setAberto(true)
        }}
        onFocus={() => {
          setTexto('')
          setAberto(true)
        }}
        placeholder={placeholder || 'Buscar projeto pelo nome'}
        className="w-full text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white"
      />

      {aberto && (
        <div className="absolute z-30 left-0 right-0 mt-0.5 border border-slate-200 rounded-md bg-white shadow-lg max-h-64 overflow-auto divide-y divide-slate-100">
          {permitirVazio && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onEscolher('')
                setAberto(false)
              }}
              className="w-full text-left px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
            >
              Sem projeto (rotina do escritório)
            </button>
          )}
          {achados.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onEscolher(p.id)
                setAberto(false)
              }}
              className="w-full text-left px-2 py-1.5 text-xs hover:bg-indigo-50"
            >
              <span className="text-slate-400 tabular-nums">{p.numero ?? '—'}</span>{' '}
              <span className="text-slate-800">{p.nome}</span>
            </button>
          ))}
          {achados.length === 0 && (
            <p className="px-2 py-2 text-[11px] text-slate-400">Nenhum projeto com esse nome.</p>
          )}
        </div>
      )}
    </div>
  )
}
