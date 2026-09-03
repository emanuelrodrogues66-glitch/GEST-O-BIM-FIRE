import { useEffect, useMemo, useRef, useState } from 'react'
import type { Cliente, Parceiro } from '../lib/cadastros'
import { carregarClientes, carregarParceiros } from '../lib/cadastros'

/** Normaliza para busca: sem acento, sem caixa. */
function chave(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export type Escolhido = {
  id: string | null
  nome: string
  contato?: string | null
  email?: string | null
  cidade?: string | null
}

/**
 * Campo de cliente ou parceiro que busca na base enquanto se digita.
 *
 * O nome continua sendo texto livre de propósito: contato novo tem que poder
 * entrar sem passar por um cadastro prévio, senão quem está com o cliente no
 * telefone trava. O que muda é que, se a pessoa já existe, ela aparece na
 * lista e é escolhida — em vez de virar um segundo cadastro com uma letra
 * diferente, que foi como a base ficou cheia de duplicata.
 */
export default function BuscaCadastro({
  tipo,
  valor,
  onEscolher,
  travado,
  autoFoco,
}: {
  tipo: 'cliente' | 'parceiro'
  valor: string | null
  onEscolher: (e: Escolhido) => void
  travado?: boolean
  autoFoco?: boolean
}) {
  const [texto, setTexto] = useState(valor || '')
  const [base, setBase] = useState<(Cliente | Parceiro)[]>([])
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ;(tipo === 'cliente' ? carregarClientes() : carregarParceiros()).then(setBase)
  }, [tipo])

  useEffect(() => setTexto(valor || ''), [valor])

  // Clicar fora fecha a lista sem desfazer o que já foi digitado.
  useEffect(() => {
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  const achados = useMemo(() => {
    const q = chave(texto)
    if (q.length < 2) return []
    return base
      .filter((c) => chave(c.nome).includes(q))
      .sort((a, b) => {
        // quem começa com o que foi digitado vem antes de quem só contém
        const ia = chave(a.nome).startsWith(q) ? 0 : 1
        const ib = chave(b.nome).startsWith(q) ? 0 : 1
        return ia - ib || a.nome.localeCompare(b.nome)
      })
      .slice(0, 8)
  }, [base, texto])

  const jaCadastrado = useMemo(
    () => base.some((c) => chave(c.nome) === chave(texto)),
    [base, texto]
  )

  function escolher(c: Cliente | Parceiro) {
    setTexto(c.nome)
    setAberto(false)
    onEscolher({
      id: c.id,
      nome: c.nome,
      contato: c.contato,
      email: c.email,
      cidade: (c as Cliente).cidade ?? null,
    })
  }

  return (
    <div className="relative" ref={caixa}>
      <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
        {tipo === 'cliente' ? 'Cliente' : 'Parceiro'}
      </label>
      <input
        value={texto}
        disabled={travado}
        autoFocus={autoFoco}
        onChange={(e) => {
          setTexto(e.target.value)
          setAberto(true)
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => {
          // Some da lista, mas o texto vale: nome novo entra como cadastro novo.
          if (texto.trim() !== (valor || '').trim()) {
            onEscolher({ id: null, nome: texto.trim() })
          }
        }}
        placeholder="Digite duas letras para buscar"
        className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs disabled:bg-slate-50"
      />

      {aberto && achados.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-0.5 border border-slate-200 rounded-md bg-white shadow-lg divide-y divide-slate-100 max-h-56 overflow-auto">
          {achados.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => escolher(c)}
              className="w-full text-left px-2 py-1.5 hover:bg-indigo-50"
            >
              <span className="text-xs font-medium text-slate-800">{c.nome}</span>
              {(c.contato || (c as Cliente).cidade) && (
                <span className="block text-[10px] text-slate-400">
                  {[c.contato, (c as Cliente).cidade].filter(Boolean).join(' · ')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {texto.trim().length >= 2 && (
        <p className="text-[10px] mt-0.5">
          {jaCadastrado ? (
            <span className="text-emerald-700">✓ já está na base</span>
          ) : (
            <span className="text-cobre-600">novo — será cadastrado ao salvar</span>
          )}
        </p>
      )}
    </div>
  )
}
