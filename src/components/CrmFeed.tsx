import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Lead } from '../lib/crm'
import { dataLocal, horaLocal } from '../lib/datas'

/**
 * O que aconteceu no comercial, tudo numa linha do tempo.
 *
 * O histórico já existia, mas trancado dentro de cada cartão: para saber como
 * foi a semana era preciso abrir negociação por negociação. Aqui é o
 * contrário — a pergunta "o que andou acontecendo?" tem uma tela só.
 *
 * Nada é gravado aqui. Tudo vem do que já foi registrado no cartão.
 */

type Tipo = 'novo' | 'contato' | 'nota' | 'etapa' | 'proposta' | 'sistema'

type Evento = {
  id: string
  /** Dia no fuso de quem está olhando, para agrupar certo. */
  dia: string
  hora: string
  quando: string
  tipo: Tipo
  titulo: string
  detalhe?: string | null
  autor?: string | null
  leadId: string | null
  lead: string | null
  cor: string
  icone: string
}

const APARENCIA: Record<Tipo, { rotulo: string; icone: string; cor: string }> = {
  novo: { rotulo: 'Negociações novas', icone: '＋', cor: '#0f766e' },
  contato: { rotulo: 'Contatos', icone: '☎', cor: '#2563eb' },
  nota: { rotulo: 'Anotações', icone: '✎', cor: '#7c3aed' },
  etapa: { rotulo: 'Mudança de etapa', icone: '→', cor: '#b45309' },
  proposta: { rotulo: 'Propostas', icone: '▤', cor: '#be123c' },
  sistema: { rotulo: 'Sistema', icone: '⚙', cor: '#94a3b8' },
}

/** Ligação, WhatsApp, e-mail e reunião são a mesma coisa aqui: alguém falou com o cliente. */
const CONTATOS = new Set(['ligacao', 'whatsapp', 'email', 'reuniao'])

const ROTULO_CONTATO: Record<string, string> = {
  ligacao: 'ligou para o cliente',
  whatsapp: 'falou por WhatsApp',
  email: 'mandou e-mail',
  reuniao: 'teve reunião',
}

const PERIODOS = [
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
  { dias: 0, rotulo: 'Tudo' },
]

function hojeStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function diasAtras(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function rotuloDoDia(d: string): string {
  if (d === hojeStr()) return 'Hoje'
  if (d === diasAtras(1)) return 'Ontem'
  const [a, m, dia] = d.split('-')
  return `${dia}/${m}/${a}`
}

/** "fulano@bimfire.com.br" -> "fulano". O e-mail inteiro não cabe e não ajuda. */
function nomeCurto(quem: string | null | undefined): string | null {
  if (!quem) return null
  return quem.includes('@') ? quem.split('@')[0] : quem
}

function classificar(tipo: string): Tipo {
  if (CONTATOS.has(tipo)) return 'contato'
  if (tipo === 'nota') return 'nota'
  if (tipo === 'etapa') return 'etapa'
  if (tipo === 'proposta') return 'proposta'
  return 'sistema'
}

type Registro = {
  id: string
  lead_id: string
  tipo: string
  texto: string | null
  quem: string | null
  quando: string
}

export default function CrmFeed({
  leads,
  onAbrirLead,
}: {
  leads: Lead[]
  onAbrirLead?: (leadId: string) => void
}) {
  const [registros, setRegistros] = useState<Registro[]>([])
  const [carregando, setCarregando] = useState(true)
  const [periodo, setPeriodo] = useState(30)
  const [filtros, setFiltros] = useState<Set<Tipo>>(new Set())
  const [autor, setAutor] = useState('')
  const [busca, setBusca] = useState('')

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo])

  async function carregar() {
    setCarregando(true)
    const desde = periodo === 0 ? '2000-01-01' : diasAtras(periodo)
    // Uma página só não basta: o PostgREST corta em 1.000 sem avisar, e o
    // histórico do comercial cresce todo dia.
    const PAGINA = 1000
    const todos: Registro[] = []
    for (let de = 0; ; de += PAGINA) {
      const { data } = await supabase
        .from('crm_lead_activities')
        .select('id, lead_id, tipo, texto, quem, quando')
        .gte('quando', `${desde}T00:00:00`)
        .order('quando', { ascending: false })
        .range(de, de + PAGINA - 1)
      const lote = (data as Registro[]) || []
      todos.push(...lote)
      if (lote.length < PAGINA) break
    }
    setRegistros(todos)
    setCarregando(false)
  }

  const porId = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads])

  const eventos = useMemo(() => {
    const desde = periodo === 0 ? '2000-01-01' : diasAtras(periodo)
    const lista: Evento[] = []

    for (const r of registros) {
      const tipo = classificar(r.tipo)
      const a = APARENCIA[tipo]
      const lead = porId.get(r.lead_id)
      lista.push({
        id: r.id,
        dia: dataLocal(r.quando),
        hora: horaLocal(r.quando),
        quando: r.quando,
        tipo,
        titulo:
          tipo === 'contato'
            ? ROTULO_CONTATO[r.tipo] || 'registrou um contato'
            : tipo === 'etapa'
              ? 'moveu de etapa'
              : tipo === 'proposta'
                ? 'gerou proposta'
                : tipo === 'nota'
                  ? 'anotou'
                  : '',
        detalhe: r.texto,
        autor: nomeCurto(r.quem),
        leadId: r.lead_id,
        lead: lead?.nome || null,
        cor: a.cor,
        icone: a.icone,
      })
    }

    // A abertura da negociação não vira atividade, mas é o começo da história.
    for (const l of leads) {
      if (!l.criado_em) continue
      const dia = dataLocal(l.criado_em)
      if (dia < desde) continue
      const a = APARENCIA.novo
      lista.push({
        id: `novo-${l.id}`,
        dia,
        hora: horaLocal(l.criado_em),
        quando: l.criado_em,
        tipo: 'novo',
        titulo: 'abriu a negociação',
        detalhe: [l.nome_cliente, l.cidade, l.fonte].filter(Boolean).join(' · ') || null,
        autor: nomeCurto(l.responsavel),
        leadId: l.id,
        lead: l.nome,
        cor: a.cor,
        icone: a.icone,
      })
    }

    return lista.sort((x, y) => y.quando.localeCompare(x.quando))
  }, [registros, leads, porId, periodo])

  const autores = useMemo(
    () => Array.from(new Set(eventos.map((e) => e.autor).filter(Boolean) as string[])).sort(),
    [eventos]
  )

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return eventos.filter((e) => {
      if (filtros.size > 0 && !filtros.has(e.tipo)) return false
      if (autor && e.autor !== autor) return false
      if (t) {
        const alvo = `${e.titulo} ${e.detalhe || ''} ${e.lead || ''} ${e.autor || ''}`.toLowerCase()
        if (!alvo.includes(t)) return false
      }
      return true
    })
  }, [eventos, filtros, autor, busca])

  const porDia = useMemo(() => {
    const mapa = new Map<string, Evento[]>()
    for (const e of visiveis) {
      if (!mapa.has(e.dia)) mapa.set(e.dia, [])
      mapa.get(e.dia)!.push(e)
    }
    return Array.from(mapa.entries())
  }, [visiveis])

  function alternar(t: Tipo) {
    setFiltros((prev) => {
      const novo = new Set(prev)
      novo.has(t) ? novo.delete(t) : novo.add(t)
      return novo
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              onClick={() => setPeriodo(p.dias)}
              className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
                periodo === p.dias
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {p.rotulo}
            </button>
          ))}
        </div>

        <select
          value={autor}
          onChange={(e) => setAutor(e.target.value)}
          className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
        >
          <option value="">Todo mundo</option>
          {autores.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <input
          placeholder="Buscar no feed..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white flex-1 min-w-[160px] max-w-xs"
        />

        <button
          onClick={carregar}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
        >
          Atualizar
        </button>

        <span className="text-xs text-slate-400 ml-auto">{visiveis.length} evento(s)</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(APARENCIA) as Tipo[]).map((t) => {
          const quantos = eventos.filter((e) => e.tipo === t).length
          const ativo = filtros.has(t)
          return (
            <button
              key={t}
              onClick={() => alternar(t)}
              disabled={quantos === 0}
              className={`text-[11px] font-medium px-2 py-1 rounded-md border transition disabled:opacity-40 ${
                ativo
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {APARENCIA[t].icone} {APARENCIA[t].rotulo} <span className="opacity-60">{quantos}</span>
            </button>
          )
        })}
        {filtros.size > 0 && (
          <button onClick={() => setFiltros(new Set())} className="text-[11px] text-indigo-600 hover:underline">
            limpar
          </button>
        )}
      </div>

      {carregando ? (
        <p className="text-sm text-slate-400 text-center py-10">Montando o feed...</p>
      ) : porDia.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10 bg-white border border-slate-200 rounded-xl shadow-sm">
          Nada aconteceu no período escolhido.
        </p>
      ) : (
        <div className="space-y-4">
          {porDia.map(([dia, items]) => (
            <div key={dia} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
              <p className="text-xs font-semibold text-slate-700 mb-3">
                {rotuloDoDia(dia)}
                <span className="font-normal text-slate-400"> · {items.length} evento(s)</span>
              </p>
              <div className="space-y-1.5 border-l-2 border-slate-100 pl-3 ml-1">
                {items.map((e) => (
                  <div key={e.id} className="relative">
                    <span
                      className="absolute -left-[19px] top-2 w-2.5 h-2.5 rounded-full ring-2 ring-white"
                      style={{ background: e.cor }}
                    />
                    <div className="border border-slate-200 rounded-lg px-2.5 py-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span style={{ color: e.cor }}>{e.icone}</span>
                        {e.autor && <span className="font-semibold text-slate-800">{e.autor}</span>}
                        {e.titulo && <span className="text-slate-700">{e.titulo}</span>}
                        {e.lead &&
                          (e.leadId && onAbrirLead ? (
                            <button
                              onClick={() => onAbrirLead(e.leadId!)}
                              className="text-slate-500 hover:text-indigo-700 hover:underline text-left"
                            >
                              · {e.lead}
                            </button>
                          ) : (
                            <span className="text-slate-400">· {e.lead}</span>
                          ))}
                        <span className="text-slate-400 tabular-nums ml-auto">{e.hora}</span>
                      </div>
                      {e.detalhe && (
                        <p className="text-[11px] text-slate-500 mt-0.5 whitespace-pre-wrap">{e.detalhe}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
