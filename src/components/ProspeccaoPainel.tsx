import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DiaDeEnvio, LinhaPainel } from '../lib/prospeccao'
import { carregarEnviosPorDia, carregarPainel } from '../lib/prospeccao'

/**
 * Painel da prospecção.
 *
 * A pergunta que ele responde é sempre a mesma: quanto de cada lista já foi
 * percorrido e o que sobrou. "Trabalhado" conta tudo que saiu da fila —
 * enviado, erro, descartado —, porque é isso que mede o caminho andado.
 * Quem ainda está na fila é o trabalho que falta.
 */

function Cartao({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className="text-lg font-semibold text-slate-700 leading-tight">{valor}</p>
      {detalhe && <p className="text-[10px] text-slate-400">{detalhe}</p>}
    </div>
  )
}

function Barra({ linha }: { linha: LinhaPainel }) {
  const pct = Number(linha.percentual) || 0
  const falta = Number(linha.fila) || 0
  return (
    <div className="py-2 border-t border-slate-100 first:border-t-0">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium text-slate-700 flex-1 truncate">{linha.nome}</span>
        <span className="text-xs text-slate-500">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden my-1 flex">
        <div className="h-full bg-emerald-500" style={{ width: (Number(linha.responderam) / Math.max(1, Number(linha.total))) * 100 + '%' }} />
        <div className="h-full bg-indigo-500" style={{ width: (Number(linha.enviados) / Math.max(1, Number(linha.total))) * 100 + '%' }} />
        <div className="h-full bg-rose-300" style={{ width: (Number(linha.falharam) / Math.max(1, Number(linha.total))) * 100 + '%' }} />
      </div>
      <p className="text-[10px] text-slate-400">
        {linha.total} contatos · faltam {falta}
        {Number(linha.responderam) > 0 && ' · ' + linha.responderam + ' responderam'}
        {Number(linha.falharam) > 0 && ' · ' + linha.falharam + ' com erro'}
        {Number(linha.ja_na_base) > 0 && ' · ' + linha.ja_na_base + ' já são da casa'}
      </p>
    </div>
  )
}

export default function ProspeccaoPainel() {
  const [linhas, setLinhas] = useState<LinhaPainel[]>([])
  const [dias, setDias] = useState<DiaDeEnvio[]>([])
  const [carregando, setCarregando] = useState(true)
  const [todas, setTodas] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const [p, d] = await Promise.all([carregarPainel(), carregarEnviosPorDia(30)])
        if (!vivo) return
        setLinhas(p)
        setDias(d)
      } catch (e) {
        console.error(e)
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  const geral = useMemo(() => {
    const soma = (f: (l: LinhaPainel) => number) =>
      linhas.reduce((s, l) => s + (Number(f(l)) || 0), 0)
    const total = soma((l) => l.total)
    const trabalhados = soma((l) => l.trabalhados)
    const responderam = soma((l) => l.responderam)
    // Mensagem que saiu: quem está como enviado mais quem já respondeu.
    const mensagens = soma((l) => l.enviados) + responderam
    return {
      total,
      trabalhados,
      mensagens,
      responderam,
      noFunil: soma((l) => l.no_funil),
      falharam: soma((l) => l.falharam),
      daCasa: soma((l) => l.ja_na_base),
      pct: total ? (100 * trabalhados) / total : 0,
      taxa: mensagens ? (100 * responderam) / mensagens : 0,
    }
  }, [linhas])

  const comMovimento = useMemo(() => linhas.filter((l) => Number(l.trabalhados) > 0), [linhas])
  const lista = todas ? linhas.filter((l) => Number(l.total) > 0) : comMovimento

  const grafico = useMemo(
    () =>
      dias.map((d) => ({
        dia: d.dia ? d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7) : '',
        Enviados: Number(d.enviados) || 0,
        Responderam: Number(d.responderam) || 0,
      })),
    [dias]
  )

  if (carregando) return <p className="text-sm text-slate-400 text-center py-20">Montando o painel...</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <Cartao rotulo="Contatos" valor={String(geral.total)} detalhe={comMovimento.length + ' campanhas em uso'} />
        <Cartao rotulo="Trabalhados" valor={String(geral.trabalhados)} detalhe={geral.pct.toFixed(1) + '% da base'} />
        <Cartao rotulo="Faltam" valor={String(geral.total - geral.trabalhados)} detalhe="ainda na fila" />
        <Cartao rotulo="Mensagens" valor={String(geral.mensagens)} detalhe="que saíram" />
        <Cartao rotulo="Responderam" valor={String(geral.responderam)} detalhe={geral.taxa.toFixed(1) + '% de resposta'} />
        <Cartao rotulo="No funil" valor={String(geral.noFunil)} detalhe="viraram negociação" />
        <Cartao rotulo="Já são da casa" valor={String(geral.daCasa)} detalhe="cliente ou negócio" />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-slate-600 mb-3">Ritmo dos últimos 30 dias</p>
        {geral.mensagens === 0 ? (
          <p className="text-xs text-slate-400 py-8 text-center">Nenhuma mensagem enviada ainda.</p>
        ) : (
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <AreaChart data={grafico} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="dia" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="Enviados" stroke="#4f46e5" fill="#c7d2fe" />
                <Area type="monotone" dataKey="Responderam" stroke="#059669" fill="#a7f3d0" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs font-semibold text-slate-600 flex-1">
            Andamento por campanha
            <span className="font-normal text-slate-400"> — verde respondeu, roxo enviado, vermelho erro</span>
          </p>
          <button
            onClick={() => setTodas(!todas)}
            className="text-[11px] px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-50"
          >
            {todas ? 'Só as que já rodaram' : 'Mostrar todas'}
          </button>
        </div>
        {!lista.length ? (
          <p className="text-xs text-slate-400 py-8 text-center">
            Nenhuma campanha com envio ainda. Escolha uma e comece por ela.
          </p>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto">
            {lista.map((l) => (
              <Barra key={l.campanha_id} linha={l} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
