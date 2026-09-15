import { useEffect, useMemo, useState } from 'react'
import type { LinhaFluxo } from '../lib/fluxoCaixa'
import {
  ROTULO_ORIGEM,
  agruparPorMes,
  carregarFluxo,
  mesAtual,
  rotuloMes,
} from '../lib/fluxoCaixa'
import { reais, rotuloDoGatilho } from '../lib/financeiro'

function formatarData(d: string | null): string {
  if (!d) return '—'
  const [a, m, dia] = d.slice(0, 10).split('-')
  return `${dia}/${m}/${a}`
}

const COR_ORIGEM: Record<string, string> = {
  combinada: 'text-slate-500',
  planejamento: 'text-cobre-700',
  sem_data: 'text-amber-700',
}

/**
 * Fluxo de caixa: o que ainda tem para entrar, e quando.
 *
 * O escritório recebe por fase — entrada, protocolo, aprovação — então a
 * pergunta "quanto entra em novembro?" só tem resposta olhando o planejamento
 * dos projetos. É o que esta tela faz: junta as parcelas com data combinada,
 * as que dependem de fase (datadas pelo planejamento) e o que já caiu, mês a
 * mês.
 *
 * As parcelas sem previsão ficam separadas de propósito. Espalhá-las num mês
 * qualquer daria um total bonito e errado.
 */
export default function FluxoCaixaView({
  onProjectClick,
}: {
  onProjectClick?: (projectId: string) => void
}) {
  const [linhas, setLinhas] = useState<LinhaFluxo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [soEmAberto, setSoEmAberto] = useState(true)
  const [busca, setBusca] = useState('')
  const [abertos, setAbertos] = useState<Set<string>>(new Set([mesAtual()]))

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    setErro('')
    try {
      setLinhas(await carregarFluxo())
    } catch (e: any) {
      setErro(e.message || 'Não foi possível carregar.')
    } finally {
      setCarregando(false)
    }
  }

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return linhas.filter((l) => {
      if (soEmAberto && l.recebida) return false
      if (!t) return true
      const alvo = [l.projeto_nome, l.projeto_numero, l.cliente, l.parceiro, l.descricao]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return alvo.includes(t)
    })
  }, [linhas, soEmAberto, busca])

  const meses = useMemo(() => agruparPorMes(filtradas), [filtradas])
  const semPrevisao = useMemo(
    () => filtradas.filter((l) => !l.recebida && !l.data_prevista),
    [filtradas]
  )

  const totais = useMemo(() => {
    const hoje = mesAtual()
    let aReceber = 0
    let atrasado = 0
    let esteMes = 0
    let recebidoNoAno = 0
    const ano = hoje.slice(0, 4)
    for (const l of linhas) {
      const v = Number(l.valor) || 0
      if (l.recebida) {
        if ((l.data_recebimento || '').startsWith(ano)) recebidoNoAno += v
        continue
      }
      aReceber += v
      if (!l.data_prevista) continue
      const mes = l.data_prevista.slice(0, 7)
      if (mes < hoje) atrasado += v
      else if (mes === hoje) esteMes += v
    }
    return { aReceber, atrasado, esteMes, recebidoNoAno }
  }, [linhas])

  function alternarMes(m: string) {
    setAbertos((prev) => {
      const novo = new Set(prev)
      novo.has(m) ? novo.delete(m) : novo.add(m)
      return novo
    })
  }

  if (carregando) {
    return <p className="text-sm text-slate-400 text-center py-10">Montando o fluxo de caixa...</p>
  }

  if (erro) {
    return (
      <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
        {erro}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {/* ---------- o retrato ---------- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Caixa titulo="A receber" valor={reais(totais.aReceber)} ajuda="tudo que ainda não caiu" />
        <Caixa
          titulo="Previsto para este mês"
          valor={reais(totais.esteMes)}
          ajuda={rotuloMes(mesAtual())}
        />
        <Caixa
          titulo="Previsão vencida"
          valor={reais(totais.atrasado)}
          destaque={totais.atrasado > 0 ? 'ruim' : undefined}
          ajuda="previsto para antes deste mês e ainda em aberto"
        />
        <Caixa
          titulo={`Recebido em ${mesAtual().slice(0, 4)}`}
          valor={reais(totais.recebidoNoAno)}
          destaque="bom"
        />
      </div>

      {/* ---------- filtros ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={soEmAberto}
            onChange={(e) => setSoEmAberto(e.target.checked)}
          />
          Só o que falta receber
        </label>

        <input
          placeholder="Buscar projeto ou cliente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 flex-1 min-w-[160px] max-w-xs"
        />

        <button
          onClick={carregar}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300"
        >
          Atualizar
        </button>

        <span className="text-xs text-slate-400 ml-auto">{filtradas.length} parcela(s)</span>
      </div>

      {/* ---------- mês a mês ---------- */}
      {meses.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10 bg-white border border-slate-200 rounded-xl shadow-sm">
          Nenhuma parcela com data no período.
        </p>
      ) : (
        <div className="space-y-2">
          {meses.map((m) => {
            const aberto = abertos.has(m.mes)
            const destaque = m.mes === mesAtual()
            return (
              <div
                key={m.mes}
                className={`bg-white border rounded-xl shadow-sm overflow-hidden ${
                  destaque ? 'border-indigo-300' : 'border-slate-200'
                }`}
              >
                <button
                  onClick={() => alternarMes(m.mes)}
                  className="w-full px-4 py-2.5 flex flex-wrap items-center gap-3 hover:bg-slate-50 text-left"
                >
                  <span className="text-slate-400 text-xs">{aberto ? '▾' : '▸'}</span>
                  <span
                    className={`text-sm font-semibold capitalize ${
                      destaque ? 'text-indigo-700' : 'text-slate-800'
                    }`}
                  >
                    {rotuloMes(m.mes)}
                  </span>
                  <span className="text-[11px] text-slate-400">{m.linhas.length} parcela(s)</span>
                  <span className="ml-auto flex flex-wrap items-center gap-4">
                    {m.previsto > 0 && (
                      <span className="text-xs text-slate-600">
                        a receber{' '}
                        <strong className="tabular-nums text-slate-800">{reais(m.previsto)}</strong>
                      </span>
                    )}
                    {m.recebido > 0 && (
                      <span className="text-xs text-emerald-700">
                        recebido <strong className="tabular-nums">{reais(m.recebido)}</strong>
                      </span>
                    )}
                  </span>
                </button>

                {aberto && (
                  <div className="border-t border-slate-100 divide-y divide-slate-50">
                    {m.linhas.map((l) => (
                      <div key={l.id} className="px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <button
                          onClick={() => onProjectClick?.(l.project_id)}
                          className="text-xs font-medium text-slate-700 hover:text-indigo-700 hover:underline text-left"
                        >
                          {l.projeto_numero ? `${l.projeto_numero} · ` : ''}
                          {l.projeto_nome}
                        </button>

                        <span className="text-[11px] text-slate-500">
                          {l.descricao}
                          <span className="text-slate-400"> · {rotuloDoGatilho(l.gatilho)}</span>
                        </span>

                        {(l.cliente || l.parceiro) && (
                          <span className="text-[11px] text-slate-400 truncate max-w-[200px]">
                            {l.cliente || l.parceiro}
                          </span>
                        )}

                        <span className="ml-auto flex items-center gap-3">
                          {l.recebida ? (
                            <span className="text-[11px] text-emerald-700">
                              ✓ recebida em {formatarData(l.data_recebimento)}
                            </span>
                          ) : (
                            <span className={`text-[11px] ${COR_ORIGEM[l.origem_previsao]}`}>
                              {formatarData(l.data_prevista)} · {ROTULO_ORIGEM[l.origem_previsao]}
                            </span>
                          )}
                          <span
                            className={`text-xs font-semibold tabular-nums ${
                              l.recebida ? 'text-emerald-700' : 'text-slate-800'
                            }`}
                          >
                            {reais(l.valor)}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ---------- o que não dá para prever ---------- */}
      {semPrevisao.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl shadow-sm p-4">
          <h3 className="text-sm font-semibold text-amber-900">
            Sem previsão de data ({semPrevisao.length})
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5 mb-2">
            Ficam fora dos meses acima porque não dá para saber quando entram. Somam{' '}
            <strong>{reais(semPrevisao.reduce((s, l) => s + (Number(l.valor) || 0), 0))}</strong>.
            Para aparecerem no fluxo, ou a parcela ganha uma data combinada, ou o projeto ganha
            planejamento com a fase do gatilho.
          </p>
          <div className="divide-y divide-slate-50">
            {semPrevisao.map((l) => (
              <div key={l.id} className="py-1.5 flex flex-wrap items-center gap-x-3 text-[11px]">
                <button
                  onClick={() => onProjectClick?.(l.project_id)}
                  className="font-medium text-slate-700 hover:text-indigo-700 hover:underline text-left"
                >
                  {l.projeto_numero ? `${l.projeto_numero} · ` : ''}
                  {l.projeto_nome}
                </button>
                <span className="text-slate-500">
                  {l.descricao} · {rotuloDoGatilho(l.gatilho)}
                </span>
                <span className="ml-auto tabular-nums font-semibold text-slate-700">
                  {reais(l.valor)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-slate-400">
        A data em <span className="text-cobre-700">cor de cobre</span> veio do planejamento do
        projeto, não de um combinado com o cliente: se a fase atrasar, o recebimento atrasa junto.
      </p>
    </div>
  )
}

function Caixa({
  titulo,
  valor,
  ajuda,
  destaque,
}: {
  titulo: string
  valor: string
  ajuda?: string
  destaque?: 'bom' | 'ruim'
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-3 py-2.5">
      <p className="text-[10px] uppercase text-slate-400">{titulo}</p>
      <p
        className={`text-base font-semibold tabular-nums ${
          destaque === 'ruim'
            ? 'text-red-600'
            : destaque === 'bom'
              ? 'text-emerald-700'
              : 'text-slate-800'
        }`}
      >
        {valor}
      </p>
      {ajuda && <p className="text-[10px] text-slate-400 leading-tight">{ajuda}</p>}
    </div>
  )
}
