import { useEffect, useMemo, useState } from 'react'
import type { VencimentoProximo } from '../lib/renovacoes'
import { carregarVencimentos, descreverVencimento, renovarServico } from '../lib/renovacoes'
import { AVISO_VENCIMENTO_DIAS, tipoColor } from '../types'
import { corDoResponsavel } from '../lib/agenda'

function dataBR(iso: string | null) {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/**
 * Carteira de renovações.
 *
 * Vistoria e laudo de SPDA vencem todo ano. Cada vencimento é um cliente que
 * precisa contratar de novo — então esta tela não é um lembrete, é a lista de
 * quem ligar esta semana, com o contato do lado.
 */
export default function RenovacoesView({
  onProjectClick,
}: {
  onProjectClick?: (id: string) => void
}) {
  const [itens, setItens] = useState<VencimentoProximo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [janela, setJanela] = useState(AVISO_VENCIMENTO_DIAS)
  const [renovando, setRenovando] = useState<string | null>(null)

  useEffect(() => {
    recarregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [janela])

  async function recarregar() {
    setCarregando(true)
    setItens(await carregarVencimentos(janela))
    setCarregando(false)
  }

  async function renovar(v: VencimentoProximo) {
    if (!confirm(`Criar o cartão da renovação de "${v.projeto.nome}"?`)) return
    setRenovando(v.projeto.id)
    try {
      const id = await renovarServico(v.projeto)
      await recarregar()
      if (confirm('Renovação criada. Abrir o cartão novo?')) onProjectClick?.(id)
    } catch (e: any) {
      alert(e.message || 'Não foi possível renovar.')
    } finally {
      setRenovando(null)
    }
  }

  const { vencidos, proximos } = useMemo(
    () => ({
      vencidos: itens.filter((i) => i.dias < 0),
      proximos: itens.filter((i) => i.dias >= 0),
    }),
    [itens]
  )

  if (carregando) {
    return <p className="text-sm text-slate-400 text-center py-10">Carregando vencimentos...</p>
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-slate-800">Renovações</h2>
        <select
          value={janela}
          onChange={(e) => setJanela(Number(e.target.value))}
          className="text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white"
        >
          <option value={30}>Próximos 30 dias</option>
          <option value={60}>Próximos 60 dias</option>
          <option value={90}>Próximos 90 dias</option>
          <option value={180}>Próximos 6 meses</option>
          <option value={365}>Próximo ano</option>
        </select>
        <span className="text-[11px] text-slate-500 ml-auto">
          {itens.length} serviço{itens.length === 1 ? '' : 's'} · {vencidos.length} vencido
          {vencidos.length === 1 ? '' : 's'}
        </span>
      </div>

      <p className="text-[11px] text-slate-500">
        Vistoria e laudo de SPDA vencem de ano em ano. Cada linha aqui é um cliente que precisa
        contratar de novo — ligue antes de o prazo virar irregularidade.
      </p>

      {itens.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl py-10 text-center">
          <p className="text-3xl mb-2">✓</p>
          <p className="text-sm text-slate-600">Nada vencendo nesta janela.</p>
          <p className="text-xs text-slate-400 mt-1">
            O vencimento é preenchido no cartão do serviço, na aba Geral.
          </p>
        </div>
      )}

      {vencidos.length > 0 && (
        <Bloco
          titulo={`Já venceram (${vencidos.length})`}
          cor="red"
          itens={vencidos}
          renovando={renovando}
          onRenovar={renovar}
          onAbrir={onProjectClick}
        />
      )}

      {proximos.length > 0 && (
        <Bloco
          titulo={`A vencer (${proximos.length})`}
          cor="amber"
          itens={proximos}
          renovando={renovando}
          onRenovar={renovar}
          onAbrir={onProjectClick}
        />
      )}
    </div>
  )
}

function Bloco({
  titulo,
  cor,
  itens,
  renovando,
  onRenovar,
  onAbrir,
}: {
  titulo: string
  cor: 'red' | 'amber'
  itens: VencimentoProximo[]
  renovando: string | null
  onRenovar: (v: VencimentoProximo) => void
  onAbrir?: (id: string) => void
}) {
  const borda = cor === 'red' ? 'border-red-300' : 'border-amber-300'
  const fundo = cor === 'red' ? 'bg-red-50/50' : 'bg-amber-50/40'
  const texto = cor === 'red' ? 'text-red-800' : 'text-amber-900'

  return (
    <div className={`border rounded-xl overflow-hidden ${borda}`}>
      <div className={`px-4 py-2 ${fundo}`}>
        <h3 className={`text-xs font-semibold ${texto}`}>{titulo}</h3>
      </div>

      <div className="divide-y divide-slate-100">
        {itens.map((v) => {
          const contato =
            v.cliente?.contato_responsavel ||
            v.cliente?.email_cliente ||
            v.cliente?.contato_parceiro ||
            ''
          return (
            <div key={v.projeto.id} className="px-4 py-2.5 flex flex-wrap items-center gap-2 bg-white">
              <span
                className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${tipoColor(
                  v.projeto.tipo
                )}`}
              >
                {v.projeto.tipo}
              </span>

              <button
                onClick={() => onAbrir?.(v.projeto.id)}
                className="text-xs font-medium text-slate-800 hover:text-indigo-700 hover:underline text-left min-w-[160px] flex-1 truncate"
              >
                {v.projeto.numero ? `${v.projeto.numero} · ` : ''}
                {v.projeto.nome}
              </button>

              {v.cliente?.nome_responsavel && (
                <span className="text-[11px] text-slate-500 truncate max-w-[160px]">
                  {v.cliente.nome_responsavel}
                </span>
              )}

              {contato && (
                <span className="text-[11px] text-slate-500 tabular-nums truncate max-w-[140px]">
                  {contato}
                </span>
              )}

              {v.projeto.responsavel && (
                <span
                  className="text-[10px] font-medium"
                  style={{ color: corDoResponsavel(v.projeto.responsavel) }}
                >
                  {v.projeto.responsavel}
                </span>
              )}

              <span className="text-[11px] text-slate-400 tabular-nums">
                {dataBR(v.projeto.data_vencimento)}
              </span>
              <span className={`text-[11px] font-medium ${texto} w-32 text-right`}>
                {descreverVencimento(v.dias)}
              </span>

              <button
                onClick={() => onRenovar(v)}
                disabled={renovando === v.projeto.id}
                className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white shrink-0"
              >
                {renovando === v.projeto.id ? '...' : '✓ Renovado'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
