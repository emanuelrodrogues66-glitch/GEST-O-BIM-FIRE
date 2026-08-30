import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Project } from '../types'
import {
  RENOVACAO_MESES,
  SERVICOS_DERIVADOS,
  diasAte,
  somarMeses,
  suggestedPoints,
  tipoColor,
} from '../types'
import { descreverVencimento, duplicarParaServico, renovarServico } from '../lib/renovacoes'

function dataBR(iso: string | null) {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/**
 * Serviços que nascem deste projeto, e o controle de renovação.
 *
 * Aprovado o projeto, quase sempre vem vistoria, funcionamento ou habite-se —
 * e cada um é processo próprio, com pontuação e aprovação separadas. Duplicar
 * evita redigitar cliente, endereço e número de processo.
 */
export default function ServicosDerivados({
  projeto,
  aprovacao,
  onAbrirProjeto,
  onMudou,
}: {
  projeto: Project
  aprovacao: string | null
  onAbrirProjeto?: (id: string) => void
  onMudou?: () => void
}) {
  const [filhos, setFilhos] = useState<Project[]>([])
  const [origem, setOrigem] = useState<Project | null>(null)
  const [criando, setCriando] = useState(false)
  const [vencimento, setVencimento] = useState(projeto.data_vencimento || '')
  const [salvandoVenc, setSalvandoVenc] = useState(false)

  const renova = !!(projeto.renovacao_meses || RENOVACAO_MESES[projeto.tipo || ''])

  useEffect(() => {
    carregar()
    setVencimento(projeto.data_vencimento || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projeto.id, projeto.data_vencimento])

  async function carregar() {
    const [{ data: f }, { data: o }] = await Promise.all([
      supabase.from('projects').select('*').eq('projeto_origem_id', projeto.id).order('numero'),
      projeto.projeto_origem_id
        ? supabase.from('projects').select('*').eq('id', projeto.projeto_origem_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    setFilhos((f as Project[]) || [])
    setOrigem((o as Project) || null)
  }

  async function criar(tipo: string) {
    setCriando(true)
    try {
      const id = await duplicarParaServico({ origem: projeto, tipo })
      await carregar()
      onMudou?.()
      if (confirm(`${tipo} criado. Abrir o cartão novo agora?`)) onAbrirProjeto?.(id)
    } catch (e: any) {
      alert(e.message || 'Não foi possível criar o serviço.')
    } finally {
      setCriando(false)
    }
  }

  async function renovar() {
    if (!confirm('Criar o cartão da próxima renovação? O atual sai da lista de vencimentos.')) return
    setCriando(true)
    try {
      const id = await renovarServico(projeto)
      await carregar()
      onMudou?.()
      if (confirm('Renovação criada. Abrir o cartão novo?')) onAbrirProjeto?.(id)
    } catch (e: any) {
      alert(e.message || 'Não foi possível renovar.')
    } finally {
      setCriando(false)
    }
  }

  async function salvarVencimento(valor: string) {
    setSalvandoVenc(true)
    const { error } = await supabase
      .from('projects')
      .update({
        data_vencimento: valor || null,
        renovacao_meses: projeto.renovacao_meses || RENOVACAO_MESES[projeto.tipo || ''] || 12,
      })
      .eq('id', projeto.id)
    setSalvandoVenc(false)
    if (error) {
      alert(error.message)
      return
    }
    onMudou?.()
  }

  const dias = projeto.data_vencimento ? diasAte(projeto.data_vencimento) : null

  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-3">
      {/* ---------- Renovação ---------- */}
      {renova && (
        <div
          className={`rounded-lg px-3 py-2.5 ${
            dias !== null && dias <= 60
              ? dias < 0
                ? 'bg-red-50 border border-red-300'
                : 'bg-amber-50 border border-amber-300'
              : 'bg-slate-50 border border-slate-200'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-xs font-semibold text-slate-800">Renovação anual</h4>
            {dias !== null && (
              <span
                className={`text-[11px] font-medium ${
                  dias < 0 ? 'text-red-700' : dias <= 60 ? 'text-amber-800' : 'text-slate-500'
                }`}
              >
                {descreverVencimento(dias)}
              </span>
            )}

            <label className="flex items-center gap-1 text-[10px] text-slate-500 ml-auto">
              vence em
              <input
                type="date"
                value={vencimento}
                onChange={(e) => {
                  setVencimento(e.target.value)
                  salvarVencimento(e.target.value)
                }}
                className="border border-slate-300 rounded-md px-1.5 py-1 text-xs"
              />
            </label>
            {salvandoVenc && <span className="text-[10px] text-slate-400">salvando...</span>}
          </div>

          {!projeto.data_vencimento && aprovacao && (
            <button
              onClick={() => {
                const sugerido = somarMeses(aprovacao, projeto.renovacao_meses || 12)
                setVencimento(sugerido)
                salvarVencimento(sugerido)
              }}
              className="text-[10px] text-indigo-600 hover:underline mt-1"
            >
              usar {dataBR(somarMeses(aprovacao, projeto.renovacao_meses || 12))} — um ano após a
              aprovação
            </button>
          )}

          {projeto.data_vencimento && (
            <button
              onClick={renovar}
              disabled={criando}
              className="mt-2 text-[11px] font-medium px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white"
            >
              ✓ Renovado — criar o cartão do próximo ciclo
            </button>
          )}
        </div>
      )}

      {/* ---------- De onde veio ---------- */}
      {origem && (
        <p className="text-[11px] text-slate-500">
          Originado de{' '}
          <button
            onClick={() => onAbrirProjeto?.(origem.id)}
            className="text-indigo-600 hover:underline font-medium"
          >
            {origem.numero ? `${origem.numero} · ` : ''}
            {origem.nome}
          </button>
        </p>
      )}

      {/* ---------- Gerar serviço ---------- */}
      <div>
        <h4 className="text-xs font-semibold text-slate-700 mb-1">Gerar serviço a partir deste</h4>
        <p className="text-[10px] text-slate-400 mb-2">
          Copia cliente, parceiro, endereço e nº do processo. O protocolo e as datas começam em
          branco, porque o processo é outro.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SERVICOS_DERIVADOS.filter((sv) => sv.tipo !== projeto.tipo).map((sv) => (
            <button
              key={sv.tipo}
              onClick={() => criar(sv.tipo)}
              disabled={criando}
              title={`${sv.ajuda} · ${suggestedPoints(sv.tipo, projeto.m2) ?? '?'} pts`}
              className="text-[11px] px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-600 hover:border-indigo-400 hover:text-indigo-700 disabled:opacity-50"
            >
              + {sv.rotulo}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Filhos ---------- */}
      {filhos.length > 0 && (
        <div className="border-t border-slate-200 pt-2">
          <h4 className="text-[11px] font-semibold text-slate-600 mb-1.5">
            Serviços gerados ({filhos.length})
          </h4>
          <div className="space-y-1">
            {filhos.map((f) => (
              <button
                key={f.id}
                onClick={() => onAbrirProjeto?.(f.id)}
                className="w-full flex flex-wrap items-center gap-2 text-[11px] text-left px-2 py-1 rounded hover:bg-slate-50"
              >
                <span
                  className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${tipoColor(f.tipo)}`}
                >
                  {f.tipo}
                </span>
                <span className="text-slate-400 tabular-nums">{f.numero ?? ''}</span>
                <span className="font-medium text-slate-700 flex-1 truncate">{f.nome}</span>
                <span className="text-slate-400">{f.status}</span>
                {f.data_vencimento && (
                  <span className="text-[10px] text-amber-700">
                    {descreverVencimento(diasAte(f.data_vencimento))}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
