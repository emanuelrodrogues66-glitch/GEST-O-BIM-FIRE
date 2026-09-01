/**
 * Ranking de pontos fora do Dashboard.
 *
 * O Dashboard reparte os pontos entre quem trabalhou no projeto (rateio por
 * horas) e só conta projeto aprovado. O PDF fazia diferente: somava `pts` cru
 * no responsável cadastrado, incluindo projeto em andamento. Dava dois números
 * com o mesmo nome — e o que ia para o cliente era o errado.
 *
 * Esta lib existe para os dois lugares usarem a mesma regra.
 */

import { supabase, carregarTabelaCompleta } from './supabase'
import type { Project } from '../types'
import { normalizeStatus } from '../types'
import type { LancamentoDeHora, SemPontuacao } from './rateioPontos'
import { calcularRateio, carregarQuemNaoPontua } from './rateioPontos'
import type { RankingRow } from './stats'

export type BasesDoRateio = {
  /** Data de aprovação de cada projeto: é ela que dá existência ao ponto. */
  aprovacoes: Record<string, string>
  horasPorProjeto: Map<string, LancamentoDeHora[]>
  rateioManual: Map<string, { colaborador: string; fracao: number }[]>
  semPontuacao: SemPontuacao
}

export async function carregarBasesDoRateio(): Promise<BasesDoRateio> {
  const [clientes, atividades, ajustes, semPontuacao] = await Promise.all([
    carregarTabelaCompleta<{ project_id: string; data_aprovacao: string | null }>(
      'project_clients',
      'project_id, data_aprovacao'
    ),
    carregarTabelaCompleta<{
      project_id: string
      responsavel: string
      horas: number | null
      horas_estimadas: boolean
    }>('project_activities', 'project_id, responsavel, horas, horas_estimadas'),
    carregarTabelaCompleta<{ project_id: string; colaborador: string; fracao: number }>(
      'project_point_shares',
      'project_id, colaborador, fracao'
    ),
    carregarQuemNaoPontua(),
  ])

  const aprovacoes: Record<string, string> = {}
  for (const c of clientes) if (c.data_aprovacao) aprovacoes[c.project_id] = c.data_aprovacao

  const horasPorProjeto = new Map<string, LancamentoDeHora[]>()
  for (const a of atividades) {
    if (!horasPorProjeto.has(a.project_id)) horasPorProjeto.set(a.project_id, [])
    horasPorProjeto.get(a.project_id)!.push({
      responsavel: a.responsavel,
      horas: a.horas,
      horas_estimadas: a.horas_estimadas,
    })
  }

  const rateioManual = new Map<string, { colaborador: string; fracao: number }[]>()
  for (const r of ajustes) {
    if (!rateioManual.has(r.project_id)) rateioManual.set(r.project_id, [])
    rateioManual.get(r.project_id)!.push({ colaborador: r.colaborador, fracao: Number(r.fracao) })
  }

  return { aprovacoes, horasPorProjeto, rateioManual, semPontuacao }
}

/**
 * Ranking dos projetos informados, com os pontos já repartidos.
 *
 * Só entra projeto Concluído e com data de aprovação: ponto só existe quando o
 * projeto é aprovado. Área e contagem seguem a mesma fração, senão dois
 * projetistas no mesmo projeto contariam dois projetos inteiros.
 */
export function rankingComRateio(projetos: Project[], bases: BasesDoRateio): RankingRow[] {
  const mapa = new Map<string, RankingRow>()

  for (const p of projetos) {
    if (normalizeStatus(p.status) !== 'Concluído') continue
    const aprovacao = bases.aprovacoes[p.id] || p.data_prazo
    if (!aprovacao) continue

    const { fatias } = calcularRateio({
      pontos: p.pts || 0,
      responsavelCadastrado: p.responsavel,
      aprovacao,
      lancamentos: bases.horasPorProjeto.get(p.id) || [],
      manual: bases.rateioManual.get(p.id),
      semPontuacao: bases.semPontuacao,
    })

    for (const f of fatias) {
      const nome = (f.colaborador || 'Sem responsável').trim()
      if (!mapa.has(nome)) mapa.set(nome, { responsavel: nome, pontos: 0, m2: 0, projetos: 0 })
      const linha = mapa.get(nome)!
      linha.pontos += f.pontos
      linha.m2 += (p.m2 || 0) * f.fracao
      linha.projetos += f.fracao
    }
  }

  return Array.from(mapa.values())
    .map((r) => ({
      ...r,
      pontos: Math.round(r.pontos * 100) / 100,
      projetos: Math.round(r.projetos * 100) / 100,
    }))
    .sort((a, b) => b.pontos - a.pontos)
}

/**
 * Progresso diário do mês, para o quadro colorido do PDF.
 *
 * Paginado: agosto de 2026 sozinho tem mais de 1200 linhas, e o PostgREST corta
 * em 1000 sem avisar. O efeito era o pior possível num relatório — dias
 * simplesmente em branco, como se ninguém tivesse trabalhado.
 */
export async function carregarProgressoDoMes(
  projectIds: string[],
  inicio: string,
  fim: string
): Promise<Record<string, Record<number, string>>> {
  const mapa: Record<string, Record<number, string>> = {}
  if (projectIds.length === 0) return mapa

  const PAGINA = 1000
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from('daily_progress')
      .select('project_id, data, letra')
      .in('project_id', projectIds)
      .gte('data', inicio)
      .lte('data', fim)
      .order('project_id')
      .order('data')
      .range(de, de + PAGINA - 1)
    if (error) throw new Error(error.message)

    const lote = (data as { project_id: string; data: string; letra: string }[]) || []
    for (const d of lote) {
      const dia = Number(d.data.split('-')[2])
      if (!mapa[d.project_id]) mapa[d.project_id] = {}
      mapa[d.project_id][dia] = d.letra
    }
    if (lote.length < PAGINA) break
  }
  return mapa
}
