import { useState } from 'react'
import type { ItemModelo, Modelo, Tudo } from '../lib/senappen'
import { excluirModelo, salvarModelo } from '../lib/senappen'

/** Chave nova para um item: estável, para a marcação sobreviver ao texto. */
function novaChave(): string {
  return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

/**
 * Modelos de checklist.
 *
 * O texto do item pode mudar; a chave não. É isso que faz corrigir uma
 * palavra no item não apagar quem já tinha marcado aquele item como feito
 * em trinta blocos.
 */
export default function SenappenModelos({
  tudo,
  podeAdministrar,
  aoMudar,
}: {
  tudo: Tudo
  podeAdministrar: boolean
  aoMudar: () => void
}) {
  const [editando, setEditando] = useState<Record<string, boolean>>({})
  const [novos, setNovos] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')

  async function tentar(fn: () => Promise<unknown>) {
    try {
      await fn()
      setErro('')
      aoMudar()
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  function blocosUsando(id: string) {
    return tudo.blocos.filter((b) => b.modelos.includes(id))
  }

  function gravarItens(m: Modelo, itens: ItemModelo[]) {
    return tentar(() => salvarModelo({ id: m.id, nome: m.nome, itens, ordem: m.ordem }))
  }

  async function novoModelo() {
    const nome = (prompt('Nome do novo checklist (ex.: Checklist executivo):') || '').trim()
    if (!nome) return
    const copiar = confirm(
      'Começar com uma cópia dos itens da Correção interna?\n\nOK = copiar os itens · Cancelar = checklist vazio'
    )
    const base = tudo.modelos.find((m) => m.id === 'internal')
    const id = 'modelo_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    await tentar(() =>
      salvarModelo({
        id,
        nome: nome.slice(0, 90),
        itens: copiar && base ? base.itens.map((i) => ({ k: i.k, t: i.t })) : [],
        ordem: Math.max(0, ...tudo.modelos.map((m) => m.ordem)) + 1,
      })
    )
    setEditando({ ...editando, [id]: true })
  }

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
        <p className="text-sm font-semibold text-slate-800">Modelos de checklist</p>
        <p className="text-[11px] text-slate-500">
          Cada bloco pode usar mais de um checklist ao mesmo tempo. Editar um modelo vale para todos
          os blocos que o usam, e as marcações dos itens que continuarem existindo são preservadas.
        </p>
        {podeAdministrar && (
          <button
            onClick={novoModelo}
            className="mt-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            + Novo checklist
          </button>
        )}
      </div>

      {erro && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {erro}
        </p>
      )}

      {tudo.modelos.map((m) => {
        const usando = blocosUsando(m.id)
        const aberto = !!editando[m.id]
        return (
          <div key={m.id} className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
            <p className="text-sm font-semibold text-slate-800">{m.nome}</p>
            <p className="text-[11px] text-slate-500">
              {m.itens.length} itens · {usando.length}{' '}
              {usando.length === 1 ? 'bloco usa este checklist' : 'blocos usam este checklist'}
            </p>

            {podeAdministrar && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Mini
                  onClick={() => {
                    const nome = prompt('Nome do checklist:', m.nome)
                    if (nome === null || !nome.trim()) return
                    tentar(() => salvarModelo({ id: m.id, nome: nome.trim().slice(0, 90), itens: m.itens, ordem: m.ordem }))
                  }}
                >
                  ✎ Renomear
                </Mini>
                <Mini
                  onClick={() => {
                    const nome = prompt('Nome da cópia:', m.nome + ' - cópia')
                    if (!nome || !nome.trim()) return
                    tentar(() =>
                      salvarModelo({
                        id: 'modelo_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                        nome: nome.trim().slice(0, 90),
                        itens: m.itens.map((i) => ({ k: i.k, t: i.t })),
                        ordem: Math.max(0, ...tudo.modelos.map((x) => x.ordem)) + 1,
                      })
                    )
                  }}
                >
                  Duplicar
                </Mini>
                {m.id !== 'internal' && (
                  <Mini
                    onClick={() => {
                      if (usando.length) {
                        alert(
                          'Este checklist está aplicado em ' +
                            usando.length +
                            ' blocos. Tire dos blocos antes de excluir.'
                        )
                        return
                      }
                      if (!confirm('Excluir o checklist ' + m.nome + '?')) return
                      tentar(() => excluirModelo(m.id))
                    }}
                  >
                    Excluir
                  </Mini>
                )}
                <Mini onClick={() => setEditando({ ...editando, [m.id]: !aberto })}>
                  {aberto ? 'Ocultar itens' : 'Editar itens'}
                </Mini>
              </div>
            )}

            {aberto && podeAdministrar && (
              <div className="mt-3">
                {m.itens.map((item, i) => (
                  <div
                    key={item.k}
                    className="border-t border-slate-100 pt-1.5 mt-1.5 flex items-center gap-1.5"
                  >
                    <span className="flex-1 text-xs text-slate-700">
                      {i + 1}. {item.t}
                    </span>
                    <Mini
                      onClick={() => {
                        const t = prompt('Editar item:', item.t)
                        if (!t || !t.trim()) return
                        gravarItens(
                          m,
                          m.itens.map((x) => (x.k === item.k ? { k: x.k, t: t.trim().slice(0, 300) } : x))
                        )
                      }}
                    >
                      ✎
                    </Mini>
                    <Mini
                      desabilitado={i === 0}
                      onClick={() => {
                        const a = m.itens.slice()
                        const tmp = a[i - 1]
                        a[i - 1] = a[i]
                        a[i] = tmp
                        gravarItens(m, a)
                      }}
                    >
                      ↑
                    </Mini>
                    <Mini
                      desabilitado={i === m.itens.length - 1}
                      onClick={() => {
                        const a = m.itens.slice()
                        const tmp = a[i + 1]
                        a[i + 1] = a[i]
                        a[i] = tmp
                        gravarItens(m, a)
                      }}
                    >
                      ↓
                    </Mini>
                    <Mini
                      onClick={() => {
                        if (!confirm('Tirar este item do checklist?')) return
                        gravarItens(
                          m,
                          m.itens.filter((x) => x.k !== item.k)
                        )
                      }}
                    >
                      ✕
                    </Mini>
                  </div>
                ))}

                <textarea
                  value={novos[m.id] || ''}
                  onChange={(e) => setNovos({ ...novos, [m.id]: e.target.value })}
                  placeholder="Novos itens, um por linha"
                  rows={3}
                  className="w-full mt-2 border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                />
                <button
                  onClick={() => {
                    const textos = (novos[m.id] || '')
                      .split(/\r?\n/)
                      .map((x) => x.trim())
                      .filter(Boolean)
                    if (!textos.length) return
                    gravarItens(m, [
                      ...m.itens,
                      ...textos.map((t) => ({ k: novaChave(), t: t.slice(0, 300) })),
                    ])
                    setNovos({ ...novos, [m.id]: '' })
                  }}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Incluir itens
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Mini({
  onClick,
  children,
  desabilitado,
}: {
  onClick: () => void
  children: React.ReactNode
  desabilitado?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={desabilitado}
      className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-300 disabled:opacity-40"
    >
      {children}
    </button>
  )
}
