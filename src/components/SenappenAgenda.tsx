import { useState } from 'react'
import type { Sessao, Tudo } from '../lib/senappen'
import {
  duracao,
  excluirSessao,
  hora,
  horaCheia,
  nomeDoBloco,
  relogio,
  salvarSessao,
} from '../lib/senappen'

type Visao = 'dia' | 'semana' | 'mes'
type Olhar = 'bloco' | 'jornada'

const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']

/** Segunda-feira da semana em que a data cai. */
function inicioDaSemana(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

function paraCampo(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes())
  )
}

/**
 * O que aconteceu, e quanto tempo levou.
 *
 * Duas leituras do mesmo dado: por bloco, para saber o que foi mexido; e
 * jornada, que é a soma do tempo de cada um nos blocos. A segunda é a que
 * responde "quanto custou revisar isso".
 */
export default function SenappenAgenda({
  tudo,
  agora,
  podeEditar,
  aoMudar,
}: {
  tudo: Tudo
  agora: number
  podeEditar: boolean
  aoMudar: () => void
}) {
  const [visao, setVisao] = useState<Visao>('semana')
  const [olhar, setOlhar] = useState<Olhar>('bloco')
  const [ancora, setAncora] = useState(() => new Date())
  const [pessoa, setPessoa] = useState('')
  const [editando, setEditando] = useState<string | null>(null)

  const pessoas = Array.from(new Set(tudo.sessoes.map((s) => s.pessoa))).sort()

  const inicio =
    visao === 'dia'
      ? new Date(ancora.getFullYear(), ancora.getMonth(), ancora.getDate())
      : visao === 'semana'
        ? inicioDaSemana(ancora)
        : new Date(ancora.getFullYear(), ancora.getMonth(), 1)
  const fim =
    visao === 'dia'
      ? new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 1)
      : visao === 'semana'
        ? new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 7)
        : new Date(inicio.getFullYear(), inicio.getMonth() + 1, 1)

  function andar(passo: number) {
    const d = new Date(ancora)
    if (visao === 'mes') d.setMonth(d.getMonth() + passo)
    else d.setDate(d.getDate() + passo * (visao === 'semana' ? 7 : 1))
    setAncora(d)
  }

  const dentro = (iso: string) => {
    const t = new Date(iso).getTime()
    return t >= inicio.getTime() && t < fim.getTime()
  }
  const sessoes = tudo.sessoes.filter((s) => dentro(s.inicio) && (!pessoa || s.pessoa === pessoa))
  const registros = tudo.registros.filter((r) => dentro(r.quando) && (!pessoa || r.pessoa === pessoa))

  const msDe = (s: Sessao) =>
    (s.fim ? new Date(s.fim).getTime() : agora) - new Date(s.inicio).getTime()

  const porPessoa = new Map<string, number>()
  let total = 0
  for (const s of sessoes) {
    porPessoa.set(s.pessoa, (porPessoa.get(s.pessoa) || 0) + msDe(s))
    total += msDe(s)
  }

  const titulo =
    visao === 'dia'
      ? inicio.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
      : visao === 'semana'
        ? inicio.toLocaleDateString('pt-BR') + ' a ' + new Date(fim.getTime() - 1).toLocaleDateString('pt-BR')
        : inicio.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const nomeBloco = (id: string | null) => {
    const b = tudo.blocos.find((x) => x.id === id)
    return b ? nomeDoBloco(b) : id || '—'
  }

  /** Os dias do período, para desenhar lista ou calendário. */
  const dias: Date[] = []
  for (let d = new Date(inicio); d < fim; d.setDate(d.getDate() + 1)) dias.push(new Date(d))

  function doDia(d: Date) {
    const a = d.getTime()
    const b = a + 86400000
    const ss = sessoes.filter((s) => {
      const t = new Date(s.inicio).getTime()
      return t >= a && t < b
    })
    const rr = registros.filter((r) => {
      const t = new Date(r.quando).getTime()
      return t >= a && t < b
    })
    return { ss, rr, ms: ss.reduce((x, s) => x + msDe(s), 0) }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {([['bloco', 'Por bloco'], ['jornada', 'Jornada']] as [Olhar, string][]).map((p) => (
            <button
              key={p[0]}
              onClick={() => setOlhar(p[0])}
              className={
                'text-xs font-medium px-3 py-1 rounded-md ' +
                (olhar === p[0] ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100')
              }
            >
              {p[1]}
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {([['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']] as [Visao, string][]).map((p) => (
            <button
              key={p[0]}
              onClick={() => setVisao(p[0])}
              className={
                'text-xs font-medium px-3 py-1 rounded-md ' +
                (visao === p[0] ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100')
              }
            >
              {p[1]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-1 py-1">
          <button onClick={() => andar(-1)} className="w-7 h-7 text-slate-500 hover:bg-slate-100 rounded-md">
            ‹
          </button>
          <button onClick={() => setAncora(new Date())} className="text-xs px-2 text-slate-600">
            Hoje
          </button>
          <button onClick={() => andar(1)} className="w-7 h-7 text-slate-500 hover:bg-slate-100 rounded-md">
            ›
          </button>
        </div>

        <select
          value={pessoa}
          onChange={(e) => setPessoa(e.target.value)}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
        >
          <option value="">Todos</option>
          {pessoas.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
        <p className="text-sm font-semibold text-slate-800 capitalize">{titulo}</p>
        <p className="text-[11px] text-slate-500">
          {total
            ? 'Tempo total ' +
              duracao(total) +
              ' · ' +
              [...porPessoa.entries()].map((p) => p[0] + ' ' + duracao(p[1])).join(' · ')
            : 'Sem registros neste período.'}
        </p>
      </div>

      {visao === 'mes' ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
          <div className="grid grid-cols-7 gap-1">
            {DIAS.map((d) => (
              <div key={d} className="text-[10px] text-slate-400 text-center uppercase">
                {d}
              </div>
            ))}
            {Array.from({ length: (inicio.getDay() + 6) % 7 }).map((_, i) => (
              <div key={'v' + i} />
            ))}
            {dias.map((d) => {
              const x = doDia(d)
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => {
                    setAncora(d)
                    setVisao('dia')
                  }}
                  className="min-h-[56px] border border-slate-100 rounded-lg p-1 text-left hover:border-indigo-300"
                >
                  <span className="text-[11px] font-medium text-slate-600 block">{d.getDate()}</span>
                  {x.ms > 0 && <span className="text-[10px] text-slate-500">{duracao(x.ms)}</span>}
                  {x.ss.length + x.rr.length > 0 && (
                    <span className="text-[10px] text-slate-400 block">
                      {x.ss.length + x.rr.length} reg.
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        dias.map((d) => {
          const x = doDia(d)
          if (visao === 'dia' || x.ss.length || x.rr.length || visao === 'semana') {
            return (
              <div key={d.toISOString()} className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
                <p className="text-xs font-semibold text-slate-700 capitalize">
                  {d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}
                  {x.ms > 0 && <span className="text-slate-400 font-normal"> · {duracao(x.ms)}</span>}
                </p>

                {olhar === 'jornada' ? (
                  <Jornada sessoes={x.ss} msDe={msDe} nomeBloco={nomeBloco} />
                ) : (
                  <>
                    {x.ss.length === 0 && x.rr.length === 0 && (
                      <p className="text-[11px] text-slate-300 mt-1">—</p>
                    )}
                    {x.ss.map((s) =>
                      editando === s.id ? (
                        <Editor
                          key={s.id}
                          sessao={s}
                          aoFechar={() => setEditando(null)}
                          aoSalvar={async (ini, f) => {
                            await salvarSessao(s.id, ini, f)
                            setEditando(null)
                            aoMudar()
                          }}
                        />
                      ) : (
                        <div
                          key={s.id}
                          className="border-t border-slate-100 pt-1.5 mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-600"
                        >
                          <span className="flex-1 min-w-[220px]">
                            <span className="tabular-nums">
                              {horaCheia(s.inicio)}–{s.fim ? horaCheia(s.fim) : 'em andamento'}
                            </span>{' '}
                            · {s.fim ? duracao(msDe(s)) : relogio(msDe(s))} · <strong>{s.pessoa}</strong> ·{' '}
                            {nomeBloco(s.bloco_id)}
                            {s.tipo ? ' · ' + s.tipo : ''}
                            {s.motivo ? ' (' + s.motivo + ')' : ''}
                            {s.editado ? ' · editado' : ''}
                          </span>
                          {podeEditar && (
                            <>
                              <button onClick={() => setEditando(s.id)} className="text-slate-400 hover:text-slate-700">
                                ✎
                              </button>
                              <button
                                onClick={async () => {
                                  if (!confirm('Excluir este registro de tempo?')) return
                                  await excluirSessao(s.id)
                                  aoMudar()
                                }}
                                className="text-slate-400 hover:text-rose-600"
                              >
                                ✕
                              </button>
                            </>
                          )}
                        </div>
                      )
                    )}
                    {x.rr.map((r) => (
                      <div
                        key={r.id}
                        className="border-t border-slate-100 pt-1.5 mt-1.5 text-[11px] text-slate-500"
                      >
                        <span className="tabular-nums">{hora(r.quando)}</span> · {r.pessoa} ·{' '}
                        {nomeBloco(r.bloco_id)} · {r.texto}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )
          }
          return null
        })
      )}
    </div>
  )
}

function Jornada({
  sessoes,
  msDe,
  nomeBloco,
}: {
  sessoes: Sessao[]
  msDe: (s: Sessao) => number
  nomeBloco: (id: string | null) => string
}) {
  const por = new Map<string, { ms: number; blocos: Set<string> }>()
  for (const s of sessoes) {
    const q = por.get(s.pessoa) || { ms: 0, blocos: new Set<string>() }
    q.ms += msDe(s)
    if (s.bloco_id) q.blocos.add(s.bloco_id)
    por.set(s.pessoa, q)
  }
  if (por.size === 0) return <p className="text-[11px] text-slate-300 mt-1">—</p>
  return (
    <div className="mt-1">
      {[...por.entries()].sort().map((p) => (
        <div
          key={p[0]}
          className="border-t border-slate-100 pt-1.5 mt-1.5 flex items-center justify-between text-[11px] text-slate-600"
        >
          <span>
            {p[0]} · {p[1].blocos.size} {p[1].blocos.size === 1 ? 'bloco' : 'blocos'}
            <span className="text-slate-400">
              {' '}
              ({[...p[1].blocos].map(nomeBloco).join(', ')})
            </span>
          </span>
          <strong className="text-slate-800">{duracao(p[1].ms)}</strong>
        </div>
      ))}
    </div>
  )
}

/**
 * Ajuste de horário.
 *
 * Existe porque o cronômetro fica esquecido ligado no almoço, e um registro
 * errado contamina a jornada do mês inteiro. Fica marcado como editado.
 */
function Editor({
  sessao,
  aoSalvar,
  aoFechar,
}: {
  sessao: Sessao
  aoSalvar: (inicio: string, fim: string | null) => void
  aoFechar: () => void
}) {
  const [ini, setIni] = useState(paraCampo(sessao.inicio))
  const [fim, setFim] = useState(sessao.fim ? paraCampo(sessao.fim) : '')
  return (
    <div className="border-t border-slate-100 pt-1.5 mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
      <span className="text-slate-500">Início</span>
      <input
        type="datetime-local"
        value={ini}
        onChange={(e) => setIni(e.target.value)}
        className="border border-slate-200 rounded-lg px-2 py-1"
      />
      <span className="text-slate-500">Fim</span>
      <input
        type="datetime-local"
        value={fim}
        onChange={(e) => setFim(e.target.value)}
        className="border border-slate-200 rounded-lg px-2 py-1"
      />
      <button
        onClick={() => {
          const a = new Date(ini).getTime()
          const b = fim ? new Date(fim).getTime() : null
          if (Number.isNaN(a) || (b !== null && (Number.isNaN(b) || b <= a))) {
            alert('Confira os horários: o fim precisa ser depois do início.')
            return
          }
          aoSalvar(new Date(a).toISOString(), b === null ? null : new Date(b).toISOString())
        }}
        className="px-2 py-1 rounded-lg bg-indigo-600 text-white"
      >
        Salvar
      </button>
      <button onClick={aoFechar} className="px-2 py-1 rounded-lg border border-slate-200">
        Cancelar
      </button>
    </div>
  )
}
