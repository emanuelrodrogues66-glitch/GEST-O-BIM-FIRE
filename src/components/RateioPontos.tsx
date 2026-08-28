import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePerfil } from '../lib/perfil'
import { corDoResponsavel } from '../lib/agenda'
import { horasLegiveis } from '../types'
import type { RateioDoProjeto, SemPontuacao } from '../lib/rateioPontos'
import {
  CORTE_RATEIO,
  calcularRateio,
  carregarLancamentos,
  carregarQuemNaoPontua,
  carregarRateioManual,
  pontosLegiveis,
  porcentagem,
} from '../lib/rateioPontos'

/** Quem lançou hora no projeto mas não disputa pontos. */
function nomesForaDoRanking(
  lancamentos: { responsavel: string; horas: number | null }[],
  fora: SemPontuacao
): string[] {
  const nomes = new Set<string>()
  for (const l of lancamentos) {
    if ((Number(l.horas) || 0) <= 0) continue
    if (fora.has(l.responsavel.trim().toLowerCase())) nomes.add(l.responsavel.trim())
  }
  return Array.from(nomes)
}

function dataBR(iso: string) {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/**
 * Divisão dos pontos entre quem trabalhou no projeto.
 *
 * Fica visível para todos de propósito: é a transparência que impede a divisão
 * de virar disputa silenciosa. Quem acha que a própria fatia está errada vê o
 * número e reclama na hora.
 */
export default function RateioPontos({
  projectId,
  pontos,
  responsavel,
  aprovacao,
}: {
  projectId: string
  pontos: number | null
  responsavel: string | null
  aprovacao: string | null
}) {
  const { ehAdmin } = usePerfil()
  const [rateio, setRateio] = useState<RateioDoProjeto | null>(null)
  // Quem trabalhou no projeto mas está fora do ranking, para o cartão explicar
  // por que aquelas horas não viraram fatia.
  const [ajudaram, setAjudaram] = useState<string[]>([])
  const [carregando, setCarregando] = useState(true)
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState<{ colaborador: string; pct: string }[]>([])
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    recarregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, pontos, responsavel, aprovacao])

  async function recarregar() {
    setCarregando(true)
    const [lancamentos, manual, semPontuacao] = await Promise.all([
      carregarLancamentos(projectId),
      carregarRateioManual(projectId),
      carregarQuemNaoPontua(),
    ])

    setRateio(
      calcularRateio({
        pontos: Number(pontos) || 0,
        responsavelCadastrado: responsavel,
        aprovacao,
        lancamentos,
        manual: manual.length > 0 ? manual : undefined,
        semPontuacao,
      })
    )

    setAjudaram(nomesForaDoRanking(lancamentos, semPontuacao))
    setCarregando(false)
  }

  function abrirEdicao() {
    setRascunho(
      (rateio?.fatias || []).map((f) => ({
        colaborador: f.colaborador,
        pct: (f.fracao * 100).toFixed(1),
      }))
    )
    setEditando(true)
  }

  async function salvarManual() {
    const linhas = rascunho
      .map((r) => ({ colaborador: r.colaborador.trim(), pct: Number(r.pct) }))
      .filter((r) => r.colaborador && r.pct > 0)

    const soma = linhas.reduce((s, l) => s + l.pct, 0)
    if (linhas.length === 0) return
    if (Math.abs(soma - 100) > 0.5) {
      alert(`As porcentagens somam ${soma.toFixed(1)}%. Precisa fechar em 100%.`)
      return
    }

    setSalvando(true)
    const { data: sessao } = await supabase.auth.getUser()

    await supabase.from('project_point_shares').delete().eq('project_id', projectId)
    const { error } = await supabase.from('project_point_shares').insert(
      linhas.map((l) => ({
        project_id: projectId,
        colaborador: l.colaborador,
        // Guardado como fração para a conta não depender da escala da tela.
        fracao: Number((l.pct / 100).toFixed(4)),
      }))
    )
    if (!error) {
      await supabase.from('project_finance').upsert(
        {
          project_id: projectId,
          rateio_ajustado_por: sessao.user?.email || null,
          rateio_ajustado_em: new Date().toISOString(),
        },
        { onConflict: 'project_id' }
      )
    }
    setSalvando(false)
    if (error) {
      alert(error.message)
      return
    }
    setEditando(false)
    recarregar()
  }

  async function voltarAoAutomatico() {
    if (!confirm('Voltar a dividir pelas horas lançadas?')) return
    await supabase.from('project_point_shares').delete().eq('project_id', projectId)
    await supabase
      .from('project_finance')
      .upsert(
        { project_id: projectId, rateio_ajustado_por: null, rateio_ajustado_em: null },
        { onConflict: 'project_id' }
      )
    setEditando(false)
    recarregar()
  }

  if (carregando) return <p className="text-[11px] text-slate-400 py-2">Calculando divisão...</p>
  if (!rateio || !pontos) return null

  const explicacao: Record<RateioDoProjeto['origem'], string> = {
    horas: `Proporcional às horas lançadas no "assumir projeto" — ${horasLegiveis(rateio.totalHoras)} no total.`,
    responsavel: 'Ninguém lançou hora neste projeto, então os pontos ficam com o responsável cadastrado.',
    manual: 'Divisão ajustada à mão pelo administrador.',
    'antes-do-corte': `Projeto aprovado antes de ${dataBR(CORTE_RATEIO)} — mantém a regra antiga, com os pontos inteiros para o responsável.`,
  }

  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-semibold text-slate-700">
          Divisão dos {pontosLegiveis(Number(pontos))} pontos
        </h4>
        {rateio.origem === 'manual' && (
          <span className="text-[10px] font-medium text-amber-800 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5">
            ajustado à mão
          </span>
        )}
        {ehAdmin && !editando && (
          <button
            onClick={abrirEdicao}
            className="ml-auto text-[10px] text-indigo-600 hover:underline"
          >
            ajustar
          </button>
        )}
      </div>

      {!editando && (
        <>
          <div className="space-y-1.5">
            {rateio.fatias.map((f) => (
              <div key={f.colaborador} className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: corDoResponsavel(f.colaborador) }}
                />
                <span className="text-xs font-medium text-slate-700 w-24 truncate">
                  {f.colaborador}
                </span>

                {/* A barra deixa a proporção óbvia sem ninguém ler número. */}
                <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden min-w-[60px]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(2, f.fracao * 100)}%`,
                      background: corDoResponsavel(f.colaborador),
                    }}
                  />
                </div>

                <span className="text-[11px] text-slate-500 tabular-nums w-14 text-right">
                  {porcentagem(f.fracao)}
                </span>
                <span className="text-xs font-semibold text-slate-800 tabular-nums w-14 text-right">
                  {pontosLegiveis(f.pontos)} pts
                </span>
                {f.horas > 0 && (
                  <span className="text-[10px] text-slate-400 tabular-nums w-14 text-right">
                    {horasLegiveis(f.horas)}
                  </span>
                )}
              </div>
            ))}
          </div>

          <p className="text-[10px] text-slate-400">{explicacao[rateio.origem]}</p>

          {ajudaram.length > 0 && (
            <p className="text-[10px] text-slate-500">
              {ajudaram.join(' e ')} também lançou hora aqui, mas não disputa pontos — as horas
              dessa ajuda saem da conta e a divisão é feita só entre os projetistas.
            </p>
          )}

          {rateio.temHoraEstimada && (
            <p className="text-[10px] text-amber-700">
              Parte destas horas veio do preenchimento automático, não do que a pessoa informou —
              confira antes de tomar a divisão como certa.
            </p>
          )}
        </>
      )}

      {editando && (
        <div className="space-y-2">
          <p className="text-[10px] text-slate-500">
            As porcentagens precisam somar 100%. Use isto quando alguém esqueceu de lançar hora.
          </p>
          {rascunho.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={r.colaborador}
                onChange={(e) =>
                  setRascunho((prev) =>
                    prev.map((x, k) => (k === i ? { ...x, colaborador: e.target.value } : x))
                  )
                }
                className="flex-1 border border-slate-300 rounded-md px-2 py-1 text-xs"
              />
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={r.pct}
                onChange={(e) =>
                  setRascunho((prev) =>
                    prev.map((x, k) => (k === i ? { ...x, pct: e.target.value } : x))
                  )
                }
                className="w-20 border border-slate-300 rounded-md px-2 py-1 text-xs text-right"
              />
              <span className="text-[10px] text-slate-400">%</span>
              <button
                onClick={() => setRascunho((prev) => prev.filter((_, k) => k !== i))}
                className="text-slate-300 hover:text-red-500 px-1"
              >
                ×
              </button>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setRascunho((prev) => [...prev, { colaborador: '', pct: '0' }])}
              className="text-[10px] text-slate-500 hover:text-indigo-600"
            >
              + pessoa
            </button>
            <span className="text-[10px] text-slate-400">
              soma:{' '}
              {rascunho.reduce((s, r) => s + (Number(r.pct) || 0), 0).toFixed(1)}%
            </span>

            <div className="ml-auto flex gap-2">
              <button
                onClick={voltarAoAutomatico}
                className="text-[10px] text-slate-500 hover:text-indigo-600"
              >
                voltar ao automático
              </button>
              <button
                onClick={() => setEditando(false)}
                className="px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-100 rounded-md"
              >
                Cancelar
              </button>
              <button
                onClick={salvarManual}
                disabled={salvando}
                className="px-3 py-1 text-[11px] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md font-medium"
              >
                {salvando ? 'Salvando...' : 'Salvar divisão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
