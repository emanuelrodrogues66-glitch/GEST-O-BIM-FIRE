/**
 * Apuração financeira de todos os projetos de uma vez.
 *
 * Carrega tudo numa passada só e devolve uma linha por projeto. A conta é a
 * mesma da aba Financeiro do cartão — se divergir, é bug: mantenha as duas
 * lendo daqui.
 */

import { supabase, carregarTabelaCompleta } from './supabase'
import type { ProjectExpense, ProjectInstallment, TeamCost } from './financeiro'
import { custoHoraNaData, rotuloDoGatilho } from './financeiro'
import type { Project } from '../types'
import { normalizeStatus } from '../types'

export type LinhaFinanceira = {
  projeto: Project
  aprovacao: string | null
  dataContrato: string | null
  dataProtocolo: string | null

  valorContrato: number
  semCustoApurado: boolean

  recebido: number
  aReceber: number

  horas: number
  horasEstimadas: number
  custoMaoDeObra: number
  despesas: number
  custoTotal: number

  margem: number
  /** Fração, não porcentagem: 0,42 = 42% do contrato. */
  margemPct: number | null
  /** Custo de cada ponto entregue — mostra se a escala de pontos bate com o esforço. */
  custoPorPonto: number | null
  /** Quem lançou hora neste projeto, com quanto cada um. */
  horasPorPessoa: Record<string, number>
}

export type ParcelaACobrar = {
  projectId: string
  projeto: string
  numero: number | null
  descricao: string
  gatilho: string
  valor: number
  liberadaEm: string
}

export type Apuracao = {
  linhas: LinhaFinanceira[]
  /** Parcelas cujo gatilho já aconteceu e que ainda não foram recebidas. */
  aCobrar: ParcelaACobrar[]
  /** Horas lançadas em tarefa geral: custo do escritório que não é de projeto. */
  horasNaoAlocadas: number
  custoNaoAlocado: number
  /** Pessoas com hora lançada e sem custo cadastrado — o custo fica subestimado. */
  semCustoCadastrado: string[]
  /** Verdadeiro quando ninguém preencheu o percentual de encargos. */
  encargosEmBranco: boolean
}

type FichaFinanceira = {
  project_id: string
  valor_contrato: number | null
  sem_custo_apurado: boolean
}

type Atividade = {
  project_id: string
  responsavel: string
  data: string
  horas: number | null
  horas_estimadas: boolean
}

type DatasCliente = {
  project_id: string
  data_aprovacao: string | null
  data_contrato: string | null
  data_protocolo: string | null
}

type TarefaGeral = {
  responsavel: string | null
  data_prazo: string
  horas_gastas: number | null
}

export async function apurar(): Promise<Apuracao> {
  const [projetos, fichas, parcelas, despesas, atividades, custos, clientes, tarefasGerais] =
    await Promise.all([
      carregarTabelaCompleta<Project>('projects'),
      carregarTabelaCompleta<FichaFinanceira>('project_finance'),
      carregarTabelaCompleta<ProjectInstallment>('project_installments'),
      carregarTabelaCompleta<ProjectExpense>('project_expenses'),
      carregarTabelaCompleta<Atividade>('project_activities'),
      carregarTabelaCompleta<TeamCost>('team_costs'),
      carregarTabelaCompleta<DatasCliente>(
        'project_clients',
        'project_id, data_aprovacao, data_contrato, data_protocolo'
      ),
      supabase
        .from('project_tasks')
        .select('responsavel, data_prazo, horas_gastas')
        .is('project_id', null)
        .not('horas_gastas', 'is', null)
        .then(({ data }) => (data as TarefaGeral[]) || []),
    ])

  const porProjeto = new Map<string, LinhaFinanceira>()
  const datas = new Map(clientes.map((c) => [c.project_id, c]))
  const fichaDe = new Map(fichas.map((f) => [f.project_id, f]))

  for (const p of projetos) {
    const ficha = fichaDe.get(p.id)
    const d = datas.get(p.id)
    porProjeto.set(p.id, {
      projeto: p,
      aprovacao: d?.data_aprovacao || null,
      dataContrato: d?.data_contrato || null,
      dataProtocolo: d?.data_protocolo || null,
      valorContrato: Number(ficha?.valor_contrato) || 0,
      semCustoApurado: !!ficha?.sem_custo_apurado,
      recebido: 0,
      aReceber: 0,
      horas: 0,
      horasEstimadas: 0,
      custoMaoDeObra: 0,
      despesas: 0,
      custoTotal: 0,
      margem: 0,
      margemPct: null,
      custoPorPonto: null,
      horasPorPessoa: {},
    })
  }

  // --- Recebimentos e parcelas liberadas ---
  const aCobrar: ParcelaACobrar[] = []
  for (const parcela of parcelas) {
    const linha = porProjeto.get(parcela.project_id)
    if (!linha) continue

    if (parcela.data_recebimento) {
      linha.recebido += Number(parcela.valor)
      continue
    }
    linha.aReceber += Number(parcela.valor)

    // Gatilho com data registrada = pode cobrar.
    const campo =
      parcela.gatilho === 'aprovacao'
        ? linha.aprovacao
        : parcela.gatilho === 'protocolo'
          ? linha.dataProtocolo
          : parcela.gatilho === 'entrada' || parcela.gatilho === 'avista'
            ? linha.dataContrato
            : null
    if (campo) {
      aCobrar.push({
        projectId: parcela.project_id,
        projeto: linha.projeto.nome,
        numero: linha.projeto.numero,
        descricao: parcela.descricao,
        gatilho: rotuloDoGatilho(parcela.gatilho),
        valor: Number(parcela.valor),
        liberadaEm: campo,
      })
    }
  }

  for (const d of despesas) {
    const linha = porProjeto.get(d.project_id)
    if (linha) linha.despesas += Number(d.valor)
  }

  // --- Mão de obra ---
  const semCusto = new Set<string>()
  for (const a of atividades) {
    const linha = porProjeto.get(a.project_id)
    const h = Number(a.horas) || 0
    if (!linha || h <= 0) continue

    linha.horas += h
    if (a.horas_estimadas) linha.horasEstimadas += h
    linha.horasPorPessoa[a.responsavel] = (linha.horasPorPessoa[a.responsavel] || 0) + h

    const custoHora = custoHoraNaData(custos, a.responsavel, a.data)
    if (custoHora === null) {
      semCusto.add(a.responsavel)
      continue
    }
    linha.custoMaoDeObra += custoHora * h
  }

  for (const linha of porProjeto.values()) {
    linha.custoTotal = linha.custoMaoDeObra + linha.despesas
    linha.margem = linha.valorContrato - linha.custoTotal
    linha.margemPct = linha.valorContrato > 0 ? linha.margem / linha.valorContrato : null
    const pts = Number(linha.projeto.pts) || 0
    linha.custoPorPonto = pts > 0 && linha.custoTotal > 0 ? linha.custoTotal / pts : null
  }

  // --- Horas que não pertencem a projeto nenhum ---
  let horasNaoAlocadas = 0
  let custoNaoAlocado = 0
  for (const t of tarefasGerais) {
    const h = Number(t.horas_gastas) || 0
    if (h <= 0) continue
    horasNaoAlocadas += h
    if (!t.responsavel) continue
    const custoHora = custoHoraNaData(custos, t.responsavel, t.data_prazo)
    if (custoHora !== null) custoNaoAlocado += custoHora * h
  }

  return {
    linhas: Array.from(porProjeto.values()),
    aCobrar: aCobrar.sort((a, b) => a.liberadaEm.localeCompare(b.liberadaEm)),
    horasNaoAlocadas,
    custoNaoAlocado,
    semCustoCadastrado: Array.from(semCusto),
    encargosEmBranco: custos.length > 0 && custos.every((c) => !c.encargos_pct),
  }
}

/** Status normalizado, para o filtro não brigar com 'done'/'DONE' no banco. */
export function statusDoProjeto(l: LinhaFinanceira): string {
  return normalizeStatus(l.projeto.status)
}
