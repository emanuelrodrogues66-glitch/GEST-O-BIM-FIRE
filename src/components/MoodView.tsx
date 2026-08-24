import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { usePerfil } from '../lib/perfil'

/** Escala de humor. A nota existe para permitir média; o emoji é a interface. */
export const HUMORES = [
  { valor: 'bravo', rotulo: 'Bravo', emoji: '😠', nota: 1, cor: '#dc2626' },
  { valor: 'irritado', rotulo: 'Irritado', emoji: '😤', nota: 2, cor: '#f97316' },
  { valor: 'triste', rotulo: 'Triste', emoji: '😢', nota: 3, cor: '#6366f1' },
  { valor: 'normal', rotulo: 'Normal', emoji: '😐', nota: 4, cor: '#64748b' },
  { valor: 'feliz', rotulo: 'Feliz', emoji: '😄', nota: 5, cor: '#16a34a' },
] as const

type Humor = (typeof HUMORES)[number]['valor']

type Checkin = {
  id: string
  colaborador: string
  data: string
  humor: Humor
  nota: number
  comentario: string | null
}

type Membro = { id: string; nome: string; ativo: boolean; ordem: number }

function hojeStr() {
  return new Date().toISOString().slice(0, 10)
}

function diasAtras(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function formatarData(d: string): string {
  const [a, m, dia] = d.split('-')
  return `${dia}/${m}/${a}`
}

function porHumor(h: string) {
  return HUMORES.find((x) => x.valor === h)
}

/** Média vira o emoji mais próximo, para leitura rápida. */
function emojiDaMedia(media: number | null): string {
  if (media === null) return '—'
  const arredondado = Math.round(media)
  return HUMORES.find((h) => h.nota === arredondado)?.emoji || '—'
}

export default function MoodView({ nomeUsuario }: { nomeUsuario: string }) {
  const { ehAdmin } = usePerfil()
  const [membros, setMembros] = useState<Membro[]>([])
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [carregando, setCarregando] = useState(true)
  const [dia, setDia] = useState(hojeStr())
  const [periodo, setPeriodo] = useState(30)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [comentario, setComentario] = useState('')
  const [novoMembro, setNovoMembro] = useState('')

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo])

  async function carregar() {
    setCarregando(true)
    const [m, c] = await Promise.all([
      supabase.from('team_members').select('*').order('ordem').order('nome'),
      supabase.from('mood_checkins').select('*').gte('data', diasAtras(periodo)).order('data'),
    ])
    setMembros((m.data as Membro[]) || [])
    setCheckins((c.data as Checkin[]) || [])
    setCarregando(false)
  }

  const doDia = useMemo(() => {
    const mapa = new Map<string, Checkin>()
    checkins.filter((c) => c.data === dia).forEach((c) => mapa.set(c.colaborador, c))
    return mapa
  }, [checkins, dia])

  /** Quem sou eu na lista da equipe (comparação frouxa por primeiro nome). */
  const euNaEquipe = useMemo(() => {
    const meu = nomeUsuario.trim().toLowerCase()
    return (
      membros.find((m) => m.nome.toLowerCase() === meu) ||
      membros.find((m) => meu.startsWith(m.nome.toLowerCase())) ||
      null
    )
  }, [membros, nomeUsuario])

  async function registrar(colaborador: string, humor: Humor) {
    const h = porHumor(humor)!
    setSalvando(colaborador)
    const { error } = await supabase.from('mood_checkins').upsert(
      {
        colaborador,
        data: dia,
        humor,
        nota: h.nota,
        comentario: comentario.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'colaborador,data' }
    )
    setSalvando(null)
    if (error) {
      alert(error.message)
      return
    }
    setComentario('')
    carregar()
  }

  // ---- Relatórios ----

  const porColaborador = useMemo(() => {
    const mapa = new Map<string, { nome: string; notas: number[]; contagem: Record<string, number> }>()
    for (const m of membros) {
      mapa.set(m.nome, { nome: m.nome, notas: [], contagem: {} })
    }
    for (const c of checkins) {
      if (!mapa.has(c.colaborador)) {
        mapa.set(c.colaborador, { nome: c.colaborador, notas: [], contagem: {} })
      }
      const linha = mapa.get(c.colaborador)!
      linha.notas.push(c.nota)
      linha.contagem[c.humor] = (linha.contagem[c.humor] || 0) + 1
    }
    return Array.from(mapa.values()).map((l) => ({
      nome: l.nome,
      respostas: l.notas.length,
      media: l.notas.length ? l.notas.reduce((s, n) => s + n, 0) / l.notas.length : null,
      contagem: l.contagem,
    }))
  }, [membros, checkins])

  const mediaGeral = useMemo(() => {
    if (checkins.length === 0) return null
    return checkins.reduce((s, c) => s + c.nota, 0) / checkins.length
  }, [checkins])

  /** Média da equipe por dia, para a linha de tendência. */
  const tendencia = useMemo(() => {
    const mapa = new Map<string, number[]>()
    for (const c of checkins) {
      if (!mapa.has(c.data)) mapa.set(c.data, [])
      mapa.get(c.data)!.push(c.nota)
    }
    return Array.from(mapa.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([data, notas]) => ({
        data: formatarData(data).slice(0, 5),
        media: Number((notas.reduce((s, n) => s + n, 0) / notas.length).toFixed(2)),
        respostas: notas.length,
      }))
  }, [checkins])

  const distribuicao = useMemo(
    () =>
      HUMORES.map((h) => ({
        humor: `${h.emoji} ${h.rotulo}`,
        quantidade: checkins.filter((c) => c.humor === h.valor).length,
        cor: h.cor,
      })),
    [checkins]
  )

  const responderamHoje = doDia.size
  const totalAtivos = membros.filter((m) => m.ativo).length

  async function adicionarMembro() {
    if (!novoMembro.trim()) return
    const { error } = await supabase
      .from('team_members')
      .insert({ nome: novoMembro.trim(), ordem: membros.length + 1 })
    if (error) {
      alert(error.message)
      return
    }
    setNovoMembro('')
    carregar()
  }

  async function removerMembro(m: Membro) {
    if (!confirm(`Tirar ${m.nome} do check-in de humor? As respostas antigas ficam.`)) return
    await supabase.from('team_members').delete().eq('id', m.id)
    carregar()
  }

  if (carregando) {
    return <p className="text-sm text-slate-400 text-center py-10">Carregando o humor da equipe...</p>
  }

  return (
    <div className="space-y-4">
      {/* ---------- Check-in do dia ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h3 className="text-sm font-semibold text-slate-800">Como você está hoje?</h3>
          <input
            type="date"
            value={dia}
            max={hojeStr()}
            onChange={(e) => setDia(e.target.value)}
            className="text-xs border border-slate-300 rounded-lg px-2 py-1.5"
            title="Responder por outro dia"
          />
          <span className="text-xs text-slate-400 ml-auto">
            {responderamHoje} de {totalAtivos} responderam
          </span>
        </div>

        {euNaEquipe ? (
          <div className="border border-indigo-200 bg-indigo-50/40 rounded-lg p-3 mb-4">
            <p className="text-xs text-slate-600 mb-2">
              Registrando como <b>{euNaEquipe.nome}</b>
              {doDia.get(euNaEquipe.nome) && (
                <span className="text-slate-400">
                  {' '}
                  · já respondeu {porHumor(doDia.get(euNaEquipe.nome)!.humor)?.emoji} — clicar de novo troca
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-2 mb-2">
              {HUMORES.map((h) => {
                const atual = doDia.get(euNaEquipe.nome)?.humor === h.valor
                return (
                  <button
                    key={h.valor}
                    onClick={() => registrar(euNaEquipe.nome, h.valor)}
                    disabled={salvando === euNaEquipe.nome}
                    className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl border-2 transition disabled:opacity-50 ${
                      atual
                        ? 'border-indigo-500 bg-white shadow-sm'
                        : 'border-transparent bg-white hover:border-slate-300'
                    }`}
                  >
                    <span className="text-2xl leading-none">{h.emoji}</span>
                    <span className="text-[10px] font-medium text-slate-600">{h.rotulo}</span>
                  </button>
                )
              })}
            </div>
            <input
              placeholder="Quer contar o motivo? (opcional)"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-md px-2 py-1.5"
            />
          </div>
        ) : (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            Seu nome ({nomeUsuario || 'sem nome'}) não está na lista da equipe, então você pode ver mas não
            registrar. {ehAdmin ? 'Adicione abaixo.' : 'Peça ao administrador para incluir.'}
          </p>
        )}

        {/* Quadro do dia */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {membros
            .filter((m) => m.ativo)
            .map((m) => {
              const resposta = doDia.get(m.nome)
              const h = resposta ? porHumor(resposta.humor) : null
              return (
                <div
                  key={m.id}
                  className={`border rounded-xl p-3 text-center ${
                    resposta ? 'border-slate-200 bg-white' : 'border-dashed border-slate-300 bg-slate-50'
                  }`}
                >
                  <div className="text-3xl leading-none mb-1">{h ? h.emoji : '⏳'}</div>
                  <p className="text-xs font-semibold text-slate-800">{m.nome}</p>
                  <p className="text-[10px] text-slate-500">
                    {h ? h.rotulo : 'não respondeu'}
                  </p>
                  {resposta?.comentario && (
                    <p className="text-[10px] text-slate-400 mt-1 italic">"{resposta.comentario}"</p>
                  )}
                  {ehAdmin && !resposta && (
                    <span className="inline-block mt-1 text-[9px] text-amber-600">pendente</span>
                  )}
                </div>
              )
            })}
        </div>
      </div>

      {/* ---------- Relatório (ADM) ---------- */}
      {ehAdmin ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setPeriodo(d)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
                    periodo === d ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {d} dias
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-400">{checkins.length} resposta(s) no período</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <p className="text-[11px] text-slate-400 uppercase tracking-wide">Média da equipe</p>
              <div className="text-4xl leading-tight my-1">{emojiDaMedia(mediaGeral)}</div>
              <p className="text-lg font-semibold text-slate-800">
                {mediaGeral !== null ? mediaGeral.toFixed(2) : '—'}
                <span className="text-xs font-normal text-slate-400"> / 5</span>
              </p>
            </div>

            <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Distribuição das respostas</h3>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={distribuicao} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="humor" tick={{ fontSize: 11 }} width={90} />
                  <Tooltip />
                  <Bar dataKey="quantidade" radius={[0, 3, 3, 0]}>
                    {distribuicao.map((d) => (
                      <Cell key={d.humor} fill={d.cor} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Média por colaborador</h3>
            <div className="space-y-2">
              {porColaborador
                .slice()
                .sort((a, b) => (b.media ?? -1) - (a.media ?? -1))
                .map((l) => (
                  <div key={l.nome} className="flex items-center gap-3 text-xs">
                    <span className="w-24 truncate text-slate-700 font-medium">{l.nome}</span>
                    <span className="text-xl leading-none">{emojiDaMedia(l.media)}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${((l.media ?? 0) / 5) * 100}%`,
                          background:
                            l.media === null
                              ? '#cbd5e1'
                              : HUMORES.find((h) => h.nota === Math.round(l.media!))?.cor || '#64748b',
                        }}
                      />
                    </div>
                    <span className="w-10 text-right text-slate-700 font-medium tabular-nums">
                      {l.media !== null ? l.media.toFixed(1) : '—'}
                    </span>
                    <span className="w-20 text-right text-slate-400">
                      {l.respostas} resp.
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {tendencia.length > 1 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Tendência do humor da equipe</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={tendencia}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                  <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11 }} width={28} />
                  <Tooltip
                    formatter={(v: any) => [`${v} / 5`, 'Média']}
                    labelFormatter={(l) => `Dia ${l}`}
                  />
                  <Line type="monotone" dataKey="media" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-1">Equipe</h3>
            <p className="text-xs text-slate-500 mb-3">Quem aparece no check-in diário.</p>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <input
                className="flex-1 min-w-[160px] border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                placeholder="Nome do colaborador"
                value={novoMembro}
                onChange={(e) => setNovoMembro(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && adicionarMembro()}
              />
              <button
                onClick={adicionarMembro}
                disabled={!novoMembro.trim()}
                className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md font-medium"
              >
                + Adicionar
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {membros.map((m) => (
                <span
                  key={m.id}
                  className="flex items-center gap-1.5 text-xs border border-slate-200 rounded-full pl-3 pr-1 py-1"
                >
                  {m.nome}
                  <button
                    onClick={() => removerMembro(m)}
                    className="text-slate-300 hover:text-red-500 px-1"
                    title="Remover da lista"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="text-xs text-slate-400 text-center py-4">
          O relatório de médias fica disponível para o administrador.
        </p>
      )}
    </div>
  )
}
