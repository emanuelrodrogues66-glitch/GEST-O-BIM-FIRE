import { useEffect, useMemo, useState } from 'react'
import type { Lead } from '../lib/crm'
import { reais } from '../lib/crm'
import type { Meta } from '../lib/meuDia'
import { carregarMetas, salvarMeta } from '../lib/meuDia'
import { resumoLigacoes } from '../lib/ligacoes'

function primeiroDia(ano: number, mes: number) {
  return ano + '-' + String(mes).padStart(2, '0') + '-01'
}
function ultimoDia(ano: number, mes: number) {
  const d = new Date(ano, mes, 0)
  return ano + '-' + String(mes).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

/**
 * Meta do mes por pessoa: valor fechado e ligacoes.
 *
 * Os projetos ja tinham Meta Pontos; o comercial discutia desempenho no olho.
 * Numero combinado antes transforma a conversa de opiniao em conferencia.
 */
export default function CrmMetas({ leads, podeEditar }: { leads: Lead[]; podeEditar: boolean }) {
  const agora = new Date()
  const [ano, setAno] = useState(agora.getFullYear())
  const [mes, setMes] = useState(agora.getMonth() + 1)
  const [metas, setMetas] = useState<Meta[]>([])
  const [ligacoes, setLigacoes] = useState<{ quem: string; total: number }[]>([])
  const [editando, setEditando] = useState<string | null>(null)
  const [valor, setValor] = useState('')
  const [quantas, setQuantas] = useState('')

  async function carregar() {
    try {
      setMetas(await carregarMetas(ano, mes))
    } catch {
      setMetas([])
    }
    try {
      const r = await resumoLigacoes(primeiroDia(ano, mes), ultimoDia(ano, mes))
      setLigacoes((r.por_pessoa || []).map((p) => ({ quem: p.quem, total: p.total })))
    } catch {
      setLigacoes([])
    }
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, mes])

  /** Quanto cada um fechou no mes escolhido. */
  const realizado = useMemo(() => {
    const mapa = new Map<string, number>()
    const de = primeiroDia(ano, mes)
    const ate = ultimoDia(ano, mes)
    for (const l of leads) {
      if (l.estado !== 'ganho' || !l.data_fechamento) continue
      if (l.data_fechamento < de || l.data_fechamento > ate) continue
      const quem = l.responsavel || 'sem responsável'
      mapa.set(quem, (mapa.get(quem) || 0) + (l.valor_fechado ?? l.valor ?? 0))
    }
    return mapa
  }, [leads, ano, mes])

  const pessoas = useMemo(() => {
    const nomes = new Set<string>()
    for (const m of metas) nomes.add(m.pessoa)
    for (const [quem] of realizado) nomes.add(quem)
    for (const l of ligacoes) nomes.add(l.quem)
    for (const l of leads) if (l.estado === 'aberta' && l.responsavel) nomes.add(l.responsavel)
    return Array.from(nomes).filter(Boolean).sort()
  }, [metas, realizado, ligacoes, leads])

  async function salvar(pessoa: string) {
    try {
      await salvarMeta({
        ano,
        mes,
        pessoa,
        meta_valor: Number(String(valor).replace(/\./g, '').replace(',', '.')) || 0,
        meta_ligacoes: Number(quantas) || 0,
      })
      setEditando(null)
      carregar()
    } catch (e: any) {
      alert(e.message || 'Não foi possível salvar a meta.')
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Metas do mês</h3>
        <select
          value={mes}
          onChange={(e) => setMes(Number(e.target.value))}
          className="text-xs border border-slate-200 rounded px-2 py-1"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, '0')}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={ano}
          onChange={(e) => setAno(Number(e.target.value) || agora.getFullYear())}
          className="w-20 text-xs border border-slate-200 rounded px-2 py-1"
        />
      </div>

      <div className="space-y-1">
        {pessoas.length === 0 && (
          <p className="text-[11px] text-slate-400">Ninguém com negociação ou ligação neste mês.</p>
        )}
        {pessoas.map((p) => {
          const meta = metas.find((m) => m.pessoa === p)
          const feito = realizado.get(p) || 0
          const lig = ligacoes.find((l) => l.quem === p)?.total || 0
          const alvo = Number(meta?.meta_valor) || 0
          const pct = alvo ? Math.min(100, (100 * feito) / alvo) : 0
          return (
            <div key={p} className="border border-slate-200 rounded-lg p-2.5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-slate-700">{p}</span>
                <span className="text-slate-500">
                  {reais(feito)}
                  {alvo ? ' de ' + reais(alvo) : ' · sem meta definida'}
                </span>
                <span className="text-slate-400">
                  {lig} ligações{meta?.meta_ligacoes ? ' de ' + meta.meta_ligacoes : ''}
                </span>
                {podeEditar && (
                  <button
                    onClick={() => {
                      setEditando(p)
                      setValor(meta ? String(meta.meta_valor) : '')
                      setQuantas(meta ? String(meta.meta_ligacoes) : '')
                    }}
                    className="ml-auto text-[11px] text-indigo-600 hover:underline"
                  >
                    definir meta
                  </button>
                )}
              </div>
              {alvo > 0 && (
                <div className="h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                  <div
                    className={pct >= 100 ? 'h-full bg-emerald-500' : 'h-full bg-indigo-500'}
                    style={{ width: pct + '%' }}
                  />
                </div>
              )}
              {editando === p && (
                <div className="flex flex-wrap items-end gap-2 mt-2">
                  <label className="text-[10px] text-slate-500">
                    Meta de valor
                    <input
                      value={valor}
                      onChange={(e) => setValor(e.target.value)}
                      placeholder="0"
                      className="block w-32 border border-slate-200 rounded px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="text-[10px] text-slate-500">
                    Meta de ligações
                    <input
                      value={quantas}
                      onChange={(e) => setQuantas(e.target.value)}
                      placeholder="0"
                      className="block w-24 border border-slate-200 rounded px-2 py-1 text-xs"
                    />
                  </label>
                  <button
                    onClick={() => salvar(p)}
                    className="px-3 py-1 rounded-md bg-indigo-600 text-white text-[11px]"
                  >
                    salvar
                  </button>
                  <button onClick={() => setEditando(null)} className="text-[11px] text-slate-500">
                    cancelar
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
