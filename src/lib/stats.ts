import type { Project } from '../types'
import { normalizeStatus, STATUS_COLUNAS } from '../types'

export type RankingRow = {
  responsavel: string
  pontos: number
  m2: number
  projetos: number
}

export function rankingPorResponsavel(projects: Project[]): RankingRow[] {
  const map = new Map<string, RankingRow>()
  for (const p of projects) {
    const nome = (p.responsavel || 'Sem responsável').trim()
    const key = nome.toLowerCase()
    if (!map.has(key)) {
      map.set(key, { responsavel: nome, pontos: 0, m2: 0, projetos: 0 })
    }
    const row = map.get(key)!
    row.pontos += p.pts || 0
    row.m2 += p.m2 || 0
    row.projetos += 1
    // Prefer the most "proper case" version of the name (first letter capitalized)
    if (/^[A-ZÀ-Ú]/.test(nome) && !/^[A-ZÀ-Ú]/.test(row.responsavel)) {
      row.responsavel = nome
    }
  }
  return Array.from(map.values()).sort((a, b) => b.pontos - a.pontos)
}

export type StatusRow = {
  status: string
  count: number
  m2: number
  pct: number
}

export function statusDistribution(projects: Project[]): StatusRow[] {
  const total = projects.length || 1
  const rows = STATUS_COLUNAS.map((status) => {
    const items = projects.filter((p) => normalizeStatus(p.status) === status)
    const m2 = items.reduce((sum, p) => sum + (p.m2 || 0), 0)
    return {
      status,
      count: items.length,
      m2,
      pct: Math.round((items.length / total) * 1000) / 10,
    }
  })
  return rows.filter((r) => r.count > 0)
}

export const STATUS_CHART_COLORS: Record<string, string> = {
  Pendente: '#94a3b8',
  Tramitando: '#f59e0b',
  'CORREÇÃO': '#f97316',
  Executando: '#6366f1',
  Zstandby: '#a855f7',
  'Concluído': '#10b981',
}

export const RANKING_COLORS = ['#f59e0b', '#94a3b8', '#b45309', '#6366f1', '#10b981', '#ec4899', '#0ea5e9', '#a855f7']

export type MetaPontos = {
  label: string
  sub: string
  valorReais: string
  meta: number
}

// Metas fixas de pontos do mês (soma dos pontos de todos os funcionários
// nos projetos concluídos/aprovados) que liberam cada faixa de bônus.
export const METAS_PONTOS: MetaPontos[] = [
  { label: 'R$ 50', sub: 'MINIMA', valorReais: '50', meta: 40 },
  { label: 'R$ 100', sub: 'BASICA', valorReais: '100', meta: 60 },
  { label: 'R$ 200', sub: 'MASTER', valorReais: '200', meta: 80 },
  { label: 'R$ 400', sub: 'MEGA', valorReais: '400', meta: 110 },
]

// Soma de pontos de todos os funcionários nos projetos aprovados
// (status Concluído) — é o valor "atual" comparado às metas do mês.
export function metaPontosAtual(projects: Project[]): number {
  return projects
    .filter((p) => normalizeStatus(p.status) === 'Concluído')
    .reduce((sum, p) => sum + (p.pts || 0), 0)
}
