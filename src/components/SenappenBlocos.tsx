import { useMemo, useState } from 'react'
import type { Bloco, Marcacao, Sessao, Situacao, Tudo } from '../lib/senappen'
import {
  SITUACOES,
  chaveDoItem,
  criarBloco,
  dataHora,
  definirModelosDoBloco,
  excluirBloco,
  iniciarSessao,
  marcar,
  marcarEmLote,
  nomeDoBloco,
  pararSessao,
  registrar,
  relogio,
} from '../lib/senappen'

const CORES: Record<Situacao, string> = {
  p: 'bg-slate-100 text-slate-500',
  f: 'bg-amber-100 text-amber-800',
  r: 'bg-emerald-100 text-emerald-800',
  c: 'bg-rose-100 text-rose-800',
}

type Filtro = 'all' | 'pend' | 'rev' | 'cor' | 'ok'

/**
 * Os blocos e o checklist de cada um.
 *
 * A regra que o app existe para sustentar: quem fez não aprova o próprio
 * item. Antes isso dependia do nome que a pessoa escolhia na caixinha; aqui
 * compara com quem está logado, e revisar virou permissão de perfil.
 */
export default function SenappenBlocos({
  tudo,
  eu,
  agora,
  minhaSessao,
  podeEditar,
  podeRevisar,
  podeAdministrar,
  aoMudar,
  exportar,
}: {
  tudo: Tudo
  eu: string
  agora: number
  minhaSessao: Sessao | null
  podeEditar: boolean
  podeRevisar: boolean
  podeAdministrar: boolean
  aoMudar: () => void
  exportar: React.ReactNode
}) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('all')
  const [abertos, setAbertos] = useState<Record<string, boolean>>({})
  const [modeloAberto, setModeloAberto] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')

  const porChave = useMemo(() => {
    const m = new Map<string, Marcacao>()
    for (const x of tudo.marcacoes) m.set(x.bloco_id + '|' + x.chave, x)
    return m
  }, [tudo.marcacoes])

  const modelo = (id: string) => tudo.modelos.find((m) => m.id === id) || null

  /** Todos os itens de um bloco, já somando os checklists aplicados nele. */
  function itensDoBloco(b: Bloco) {
    const saida: { chave: string; texto: string; modeloId: string }[] = []
    for (const mid of b.modelos) {
      const m = modelo(mid)
      if (!m) continue
      for (const i of m.itens) saida.push({ chave: chaveDoItem(mid, i.k), texto: i.t, modeloId: mid })
    }
    return saida
  }

  function contar(b: Bloco) {
    let total = 0,
      revisados = 0,
      feitos = 0,
      corrigir = 0
    for (const i of itensDoBloco(b)) {
      total++
      const s = porChave.get(b.id + '|' + i.chave)?.status || 'p'
      if (s === 'r') revisados++
      else if (s === 'f') feitos++
      else if (s === 'c') corrigir++
    }
    return { total, revisados, feitos, corrigir }
  }

  const geral = useMemo(() => {
    let total = 0,
      revisados = 0,
      feitos = 0
    for (const b of tudo.blocos) {
      const c = contar(b)
      total += c.total
      revisados += c.revisados
      feitos += c.feitos
    }
    return { total, revisados, feitos }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tudo])

  async function tentar(fn: () => Promise<unknown>) {
    try {
      await fn()
      setErro('')
      aoMudar()
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  const visiveis = tudo.blocos.filter((b) => {
    if (busca && !nomeDoBloco(b).toLowerCase().includes(busca.toLowerCase())) return false
    const c = contar(b)
    if (filtro === 'pend') return c.total > 0 && c.revisados < c.total
    if (filtro === 'rev') return c.feitos > 0
    if (filtro === 'cor') return c.corrigir > 0
    if (filtro === 'ok') return c.total > 0 && c.revisados === c.total
    return true
  })

  async function novoBloco() {
    const codigo = (prompt('Número do bloco (ex.: 38 ou 29C):') || '')
      .trim()
      .replace(/[^A-Za-z0-9_-]/g, '')
      .toUpperCase()
      .slice(0, 10)
    if (!codigo) return
    const nome = (prompt('Nome do bloco (ex.: GUARITA 2):') || '').trim().slice(0, 60)
    if (!nome) return
    const lista = tudo.modelos.map((m, i) => i + 1 + ' - ' + m.nome).join('\n')
    const escolha = prompt('Checklist inicial deste bloco (digite o número):\n' + lista, '1')
    if (escolha === null) return
    const m = tudo.modelos[Number(escolha) - 1]
    if (!m) {
      alert('Checklist inválido.')
      return
    }
    const ordem = Math.max(0, ...tudo.blocos.map((b) => b.ordem)) + 1
    await tentar(async () => {
      await criarBloco(codigo, nome, m.id, ordem)
      await registrar(eu, 'bl' + codigo.toLowerCase(), 'criou o bloco ' + codigo + ' - ' + nome)
    })
  }

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
        <p className="text-xs text-slate-600">
          Geral: <strong className="text-slate-800">{geral.revisados}</strong> de {geral.total}{' '}
          itens revisados · {geral.feitos} aguardando revisão
        </p>
        <Barra revisados={geral.revisados} feitos={geral.feitos} total={geral.total} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar bloco..."
          className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs flex-1 min-w-[180px]"
        />
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as Filtro)}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
        >
          <option value="all">Todos</option>
          <option value="pend">Pendentes</option>
          <option value="rev">Aguardando revisão</option>
          <option value="cor">Para corrigir</option>
          <option value="ok">Concluídos</option>
        </select>
        {podeAdministrar && (
          <button
            onClick={novoBloco}
            className="text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          >
            + Novo bloco
          </button>
        )}
        {exportar}
      </div>

      {erro && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {erro}
        </p>
      )}

      {minhaSessao && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex flex-wrap items-center gap-2 text-xs text-amber-900">
          <span>
            ⏱ Seu cronômetro:{' '}
            <strong>
              {tudo.blocos.find((b) => b.id === minhaSessao.bloco_id)
                ? nomeDoBloco(tudo.blocos.find((b) => b.id === minhaSessao.bloco_id)!)
                : minhaSessao.bloco_id}
            </strong>{' '}
            <span className="tabular-nums font-semibold">
              {relogio(agora - new Date(minhaSessao.inicio).getTime())}
            </span>
          </span>
          <button
            onClick={() => tentar(() => pararSessao(minhaSessao.id, 'Pausa/almoço'))}
            className="px-2 py-1 rounded-lg border border-amber-300 bg-white"
          >
            Pausa/almoço
          </button>
          <button
            onClick={() => tentar(() => pararSessao(minhaSessao.id, 'Finalizado'))}
            className="px-2 py-1 rounded-lg border border-amber-300 bg-white"
          >
            Finalizar
          </button>
        </div>
      )}

      {visiveis.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-10 bg-white border border-slate-200 rounded-xl">
          Nenhum bloco encontrado.
        </p>
      )}

      {visiveis.map((b) => {
        const c = contar(b)
        const aberto = !!abertos[b.id]
        const ativo = b.modelos.includes(modeloAberto[b.id]) ? modeloAberto[b.id] : b.modelos[0]
        const m = ativo ? modelo(ativo) : null
        const rodando = tudo.sessoes.filter((s) => !s.fim && s.bloco_id === b.id)

        return (
          <div key={b.id} className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setAbertos({ ...abertos, [b.id]: !aberto })}
                className="flex-1 min-w-[200px] text-left"
              >
                <span className="text-sm font-semibold text-slate-800">
                  {aberto ? '▾ ' : '▸ '}
                  {nomeDoBloco(b)}
                </span>
                <span className="block text-[11px] text-slate-500">
                  {c.revisados}/{c.total} revisados · {c.feitos} aguardando revisão
                  {c.corrigir ? ' · ' + c.corrigir + ' para corrigir' : ''} ·{' '}
                  {b.modelos.map((id) => modelo(id)?.nome || id).join(' + ')}
                </span>
              </button>

              <div className="flex flex-wrap items-center gap-1.5">
                {rodando.map((s) => (
                  <span
                    key={s.id}
                    className="text-[11px] bg-amber-100 text-amber-800 rounded-full px-2 py-0.5 tabular-nums"
                  >
                    {s.pessoa} ⏱ {relogio(agora - new Date(s.inicio).getTime())}
                  </span>
                ))}
                {podeEditar && !rodando.some((s) => s.pessoa === eu) && (
                  <button
                    onClick={() =>
                      tentar(async () => {
                        if (minhaSessao) {
                          if (
                            !confirm(
                              'Você está com o cronômetro em outro bloco. Parar aquele e começar este?'
                            )
                          )
                            return
                          await pararSessao(minhaSessao.id, 'Troca de bloco')
                        }
                        await iniciarSessao(b.id, eu, podeRevisar ? 'Revisão' : 'Correção')
                      })
                    }
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    ▶ Iniciar
                  </button>
                )}
              </div>
            </div>

            <Barra revisados={c.revisados} feitos={c.feitos} total={c.total} />

            {aberto && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase text-slate-400">Checklist</span>
                  <select
                    value={ativo || ''}
                    onChange={(e) => setModeloAberto({ ...modeloAberto, [b.id]: e.target.value })}
                    className="border border-slate-200 rounded-lg px-2 py-1 text-xs"
                  >
                    {b.modelos.map((id) => (
                      <option key={id} value={id}>
                        {modelo(id)?.nome || id}
                      </option>
                    ))}
                  </select>

                  {podeAdministrar && (
                    <>
                      <Mini
                        onClick={() => {
                          const livres = tudo.modelos.filter((x) => !b.modelos.includes(x.id))
                          if (!livres.length) {
                            alert('Todos os checklists já estão neste bloco.')
                            return
                          }
                          const escolha = prompt(
                            'Qual checklist adicionar?\n' +
                              livres.map((x, i) => i + 1 + ' - ' + x.nome).join('\n'),
                            '1'
                          )
                          if (escolha === null) return
                          const novo = livres[Number(escolha) - 1]
                          if (!novo) return alert('Checklist inválido.')
                          tentar(() => definirModelosDoBloco(b.id, [...b.modelos, novo.id]))
                        }}
                      >
                        + Adicionar checklist
                      </Mini>
                      {b.modelos.length > 1 && ativo && (
                        <Mini
                          onClick={() => {
                            if (!confirm('Tirar este checklist do bloco? As marcações ficam guardadas.'))
                              return
                            tentar(() =>
                              definirModelosDoBloco(
                                b.id,
                                b.modelos.filter((x) => x !== ativo)
                              )
                            )
                          }}
                        >
                          Tirar checklist do bloco
                        </Mini>
                      )}
                      <Mini
                        onClick={() => {
                          if (!confirm('Excluir ' + nomeDoBloco(b) + '? As marcações dele somem junto.'))
                            return
                          tentar(async () => {
                            await excluirBloco(b.id)
                            await registrar(eu, null, 'excluiu o bloco ' + nomeDoBloco(b))
                          })
                        }}
                      >
                        Excluir bloco
                      </Mini>
                    </>
                  )}
                </div>

                {m && podeEditar && (
                  <div className="flex flex-wrap gap-1.5">
                    <Mini
                      onClick={() =>
                        tentar(async () => {
                          const linhas = m.itens
                            .map((i) => ({ chave: chaveDoItem(m.id, i.k), item: i }))
                            .filter((x) => {
                              const s = porChave.get(b.id + '|' + x.chave)?.status || 'p'
                              return s !== 'f' && s !== 'r'
                            })
                            .map((x) => ({
                              bloco_id: b.id,
                              chave: x.chave,
                              modelo_id: m.id,
                              status: 'f' as Situacao,
                              feito_por: eu,
                              feito_em: new Date().toISOString(),
                              revisado_por: null,
                              revisado_em: null,
                              nota: null,
                            }))
                          if (!linhas.length) return alert('Nada para marcar neste checklist.')
                          await marcarEmLote(linhas)
                          await registrar(
                            eu,
                            b.id,
                            'marcou ' + linhas.length + ' itens como feitos em ' + m.nome
                          )
                        })
                      }
                    >
                      Marcar todos como feitos
                    </Mini>
                    {podeRevisar && (
                      <Mini
                        onClick={() =>
                          tentar(async () => {
                            const linhas = m.itens
                              .map((i) => ({
                                chave: chaveDoItem(m.id, i.k),
                                d: porChave.get(b.id + '|' + chaveDoItem(m.id, i.k)),
                              }))
                              .filter((x) => x.d?.status === 'f' && x.d?.feito_por !== eu)
                              .map((x) => ({
                                bloco_id: b.id,
                                chave: x.chave,
                                modelo_id: m.id,
                                status: 'r' as Situacao,
                                feito_por: x.d?.feito_por || null,
                                feito_em: x.d?.feito_em || null,
                                revisado_por: eu,
                                revisado_em: new Date().toISOString(),
                                nota: null,
                              }))
                            if (!linhas.length)
                              return alert('Nada para aprovar: ou não há itens feitos, ou foram feitos por você.')
                            await marcarEmLote(linhas)
                            await registrar(eu, b.id, 'aprovou ' + linhas.length + ' itens em ' + m.nome)
                          })
                        }
                      >
                        Aprovar todos os feitos
                      </Mini>
                    )}
                  </div>
                )}

                {!m && (
                  <p className="text-[11px] text-slate-400">
                    Nenhum checklist aplicado neste bloco.
                  </p>
                )}

                {m?.itens.map((item) => {
                  const chave = chaveDoItem(m.id, item.k)
                  const d = porChave.get(b.id + '|' + chave)
                  const s: Situacao = d?.status || 'p'
                  const fiz = d?.feito_por === eu
                  return (
                    <div key={chave} className="border-t border-slate-100 pt-2 flex flex-wrap gap-2">
                      <div className="flex-1 min-w-[240px]">
                        <span
                          className={
                            'text-[10px] rounded-full px-2 py-0.5 mr-1.5 align-middle ' + CORES[s]
                          }
                        >
                          {SITUACOES[s]}
                        </span>
                        <span className="text-xs text-slate-700">{item.t}</span>
                        {(d?.feito_por || d?.revisado_por) && (
                          <p className="text-[10px] text-slate-400">
                            {d?.feito_por && 'Feito por ' + d.feito_por + ' · ' + dataHora(d.feito_em)}
                            {d?.feito_por && d?.revisado_por ? '  |  ' : ''}
                            {d?.revisado_por &&
                              (s === 'r' ? 'Revisado' : 'Conferido') +
                                ' por ' +
                                d.revisado_por +
                                ' · ' +
                                dataHora(d.revisado_em)}
                          </p>
                        )}
                        {s === 'c' && d?.nota && (
                          <p className="text-[11px] text-rose-700">
                            Correção pedida por {d.revisado_por}: {d.nota}
                          </p>
                        )}
                      </div>

                      <div className="flex items-start gap-1.5">
                        {podeEditar && (s === 'p' || s === 'c') && (
                          <Mini
                            onClick={() =>
                              tentar(async () => {
                                await marcar(b.id, chave, m.id, {
                                  status: 'f',
                                  feito_por: eu,
                                  feito_em: new Date().toISOString(),
                                  revisado_por: null,
                                  revisado_em: null,
                                  nota: null,
                                })
                                await registrar(eu, b.id, 'marcou como feito: ' + item.t)
                              })
                            }
                          >
                            Feito
                          </Mini>
                        )}

                        {s === 'f' && podeRevisar && (
                          <>
                            <Mini
                              desabilitado={fiz}
                              titulo={fiz ? 'Quem fez não revisa o próprio item' : ''}
                              onClick={() =>
                                tentar(async () => {
                                  await marcar(b.id, chave, m.id, {
                                    status: 'r',
                                    revisado_por: eu,
                                    revisado_em: new Date().toISOString(),
                                    nota: null,
                                  })
                                  await registrar(eu, b.id, 'aprovou: ' + item.t)
                                })
                              }
                            >
                              Aprovar
                            </Mini>
                            <Mini
                              desabilitado={fiz}
                              titulo={fiz ? 'Quem fez não revisa o próprio item' : ''}
                              onClick={() => {
                                const nota = prompt('O que precisa ser corrigido?')
                                if (nota === null) return
                                tentar(async () => {
                                  await marcar(b.id, chave, m.id, {
                                    status: 'c',
                                    revisado_por: eu,
                                    revisado_em: new Date().toISOString(),
                                    nota: nota.trim(),
                                  })
                                  await registrar(eu, b.id, 'pediu correção em: ' + item.t)
                                })
                              }}
                            >
                              Corrigir
                            </Mini>
                          </>
                        )}

                        {s === 'r' && podeRevisar && (
                          <Mini
                            onClick={() =>
                              tentar(async () => {
                                await marcar(b.id, chave, m.id, {
                                  status: 'p',
                                  feito_por: null,
                                  feito_em: null,
                                  revisado_por: null,
                                  revisado_em: null,
                                  nota: null,
                                })
                                await registrar(eu, b.id, 'reabriu: ' + item.t)
                              })
                            }
                          >
                            Reabrir
                          </Mini>
                        )}
                      </div>
                    </div>
                  )
                })}

                {m && m.itens.length === 0 && (
                  <p className="text-[11px] text-slate-400">
                    Este checklist está vazio. Inclua itens na aba Modelos de checklist.
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Barra({ revisados, feitos, total }: { revisados: number; feitos: number; total: number }) {
  const pct = (n: number) => (total ? (n / total) * 100 : 0)
  return (
    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden flex mt-1.5">
      <span className="bg-emerald-500 h-full" style={{ width: pct(revisados) + '%' }} />
      <span className="bg-amber-400 h-full" style={{ width: pct(feitos) + '%' }} />
    </div>
  )
}

function Mini({
  onClick,
  children,
  desabilitado,
  titulo,
}: {
  onClick: () => void
  children: React.ReactNode
  desabilitado?: boolean
  titulo?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={desabilitado}
      title={titulo}
      className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-300 disabled:opacity-40"
    >
      {children}
    </button>
  )
}
