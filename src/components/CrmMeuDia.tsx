import { useEffect, useMemo, useState } from 'react'
import type { Lead } from '../lib/crm'
import { reais } from '../lib/crm'
import { diasDesde, entradasNaEtapa } from '../lib/meuDia'
import { resumoLigacoes } from '../lib/ligacoes'

const HOJE = () => new Date().toISOString().slice(0, 10)

function dataBR(iso: string | null) {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return d + '/' + m + '/' + a
}

/**
 * O que fazer hoje, no comercial.
 *
 * Todas estas respostas ja existiam espalhadas pelo sistema — retorno
 * agendado num campo, ultimo contato noutro, etapa parada em lugar nenhum.
 * Juntar numa tela so e o que transforma dado em trabalho do dia.
 */
export default function CrmMeuDia({
  leads,
  onAbrirLead,
}: {
  leads: Lead[]
  onAbrirLead?: (id: string) => void
}) {
  const [entradas, setEntradas] = useState<Map<string, string>>(new Map())
  const [ligacoesHoje, setLigacoesHoje] = useState({ total: 0, atendidas: 0 })
  const [so, setSo] = useState('')

  const abertas = useMemo(() => leads.filter((l) => l.estado === 'aberta'), [leads])

  useEffect(() => {
    entradasNaEtapa(abertas.map((l) => l.id)).then(setEntradas).catch(() => setEntradas(new Map()))
  }, [abertas])

  useEffect(() => {
    const hoje = HOJE()
    resumoLigacoes(hoje, hoje)
      .then((r) => setLigacoesHoje({ total: r.total, atendidas: r.atendidas }))
      .catch(() => setLigacoesHoje({ total: 0, atendidas: 0 }))
  }, [])

  const responsaveis = useMemo(
    () => Array.from(new Set(abertas.map((l) => l.responsavel || 'sem responsável'))).sort(),
    [abertas]
  )
  const minhas = useMemo(
    () => (so ? abertas.filter((l) => (l.responsavel || 'sem responsável') === so) : abertas),
    [abertas, so]
  )

  const hoje = HOJE()
  const retornos = minhas
    .filter((l) => l.retorno_em && l.retorno_em <= hoje)
    .sort((a, b) => (a.retorno_em || '').localeCompare(b.retorno_em || ''))

  const semContato = minhas
    .filter((l) => (diasDesde(l.ultimo_contato_em) ?? 999) > 15)
    .sort((a, b) => (diasDesde(b.ultimo_contato_em) ?? 999) - (diasDesde(a.ultimo_contato_em) ?? 999))

  const paradas = minhas
    .map((l) => ({ lead: l, dias: diasDesde(entradas.get(l.id) || l.criado_em) ?? 0 }))
    .filter((x) => x.dias > 14)
    .sort((a, b) => b.dias - a.dias)

  const valorEmJogo = minhas.reduce((s, l) => s + (l.valor_fechado ?? l.valor ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-700">Meu dia</h2>
        <select
          value={so}
          onChange={(e) => setSo(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1"
        >
          <option value="">Todo mundo</option>
          {responsaveis.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-slate-500 ml-auto">
          {minhas.length} negociações abertas · {reais(valorEmJogo)} em jogo ·{' '}
          {ligacoesHoje.total} ligação(ões) hoje ({ligacoesHoje.atendidas} atendidas)
        </span>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Bloco
          titulo="Retornos para hoje"
          vazio="Nenhum retorno agendado para hoje ou atrasado."
          tom="indigo"
          itens={retornos.map((l) => ({
            id: l.id,
            principal: l.nome_cliente || l.nome,
            detalhe:
              (l.retorno_em === hoje ? 'hoje' : 'atrasado desde ' + dataBR(l.retorno_em)) +
              ' · ' + (l.responsavel || 'sem responsável'),
            direita: reais(l.valor_fechado ?? l.valor ?? 0),
          }))}
          onAbrir={onAbrirLead}
        />

        <Bloco
          titulo="Sem contato há mais de 15 dias"
          vazio="Todo mundo foi procurado nos últimos 15 dias."
          tom="amber"
          itens={semContato.slice(0, 15).map((l) => ({
            id: l.id,
            principal: l.nome_cliente || l.nome,
            detalhe:
              (l.ultimo_contato_em ? diasDesde(l.ultimo_contato_em) + ' dias' : 'nunca contatado') +
              ' · ' + (l.responsavel || 'sem responsável'),
            direita: reais(l.valor_fechado ?? l.valor ?? 0),
          }))}
          onAbrir={onAbrirLead}
        />

        <Bloco
          titulo="Paradas na mesma etapa"
          vazio="Nada parado há mais de duas semanas."
          tom="rose"
          itens={paradas.slice(0, 15).map((x) => ({
            id: x.lead.id,
            principal: x.lead.nome_cliente || x.lead.nome,
            detalhe: x.dias + ' dias parada · ' + (x.lead.responsavel || 'sem responsável'),
            direita: reais(x.lead.valor_fechado ?? x.lead.valor ?? 0),
          }))}
          onAbrir={onAbrirLead}
        />
      </div>
    </div>
  )
}

function Bloco({
  titulo,
  itens,
  vazio,
  tom,
  onAbrir,
}: {
  titulo: string
  vazio: string
  tom: 'indigo' | 'amber' | 'rose'
  itens: { id: string; principal: string; detalhe: string; direita: string }[]
  onAbrir?: (id: string) => void
}) {
  const cor =
    tom === 'indigo' ? 'border-indigo-200' : tom === 'amber' ? 'border-amber-200' : 'border-rose-200'
  return (
    <div className={'bg-white border rounded-xl shadow-sm p-3 ' + cor}>
      <h3 className="text-sm font-semibold text-slate-700 mb-2">
        {titulo} <span className="text-slate-400 font-normal">({itens.length})</span>
      </h3>
      {itens.length === 0 ? (
        <p className="text-[11px] text-slate-400">{vazio}</p>
      ) : (
        <div className="space-y-1">
          {itens.map((i) => (
            <button
              key={i.id}
              onClick={() => onAbrir?.(i.id)}
              className="w-full text-left flex items-center gap-2 text-[11px] border-b border-slate-100 pb-1 hover:bg-slate-50"
            >
              <span className="flex-1 min-w-0">
                <span className="block text-slate-700 font-medium truncate">{i.principal}</span>
                <span className="block text-slate-400">{i.detalhe}</span>
              </span>
              <span className="text-slate-500 whitespace-nowrap">{i.direita}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
