import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Permissões do app.
 *
 * A checagem de verdade está no banco (RLS). O que existe aqui é para a tela
 * não oferecer botão que o banco vai recusar — esconder é cortesia, restringir
 * é o Postgres. Sempre que uma permissão nova entrar nesta lista, ela precisa
 * de política correspondente lá, senão vira teatro.
 */

export type Permissao = {
  codigo: string
  rotulo: string
  descricao: string
  grupo: string
  /** Marca as que abrem dados sensíveis, para a tela destacar. */
  sensivel?: boolean
}

export const PERMISSOES: Permissao[] = [
  // ---------------------------------------------------------------- projetos
  {
    codigo: 'projetos.ver',
    rotulo: 'Ver projetos',
    descricao: 'Abrir o quadro, a lista e os cartões.',
    grupo: 'Projetos',
  },
  {
    codigo: 'projetos.editar',
    rotulo: 'Criar e editar projetos',
    descricao: 'Mexer nos dados do cartão, status, prazos e dados do cliente.',
    grupo: 'Projetos',
  },
  {
    codigo: 'projetos.excluir',
    rotulo: 'Excluir projeto',
    descricao: 'Apagar um cartão inteiro. Não tem desfazer.',
    grupo: 'Projetos',
    sensivel: true,
  },
  {
    codigo: 'projetos.pontos',
    rotulo: 'Alterar pontos e divisão',
    descricao: 'Mudar a pontuação do projeto e o rateio entre os projetistas.',
    grupo: 'Projetos',
    sensivel: true,
  },

  // ----------------------------------------------------------------- tarefas
  {
    codigo: 'tarefas.ver',
    rotulo: 'Ver tarefas e agenda',
    descricao: 'Calendário, cronograma e tarefas gerais.',
    grupo: 'Tarefas',
  },
  {
    codigo: 'tarefas.editar',
    rotulo: 'Criar e editar tarefas',
    descricao: 'Incluir tarefa, mudar responsável, concluir.',
    grupo: 'Tarefas',
  },

  // --------------------------------------------------------------- cadastros
  {
    codigo: 'cadastros.ver',
    rotulo: 'Ver clientes e parceiros',
    descricao: 'A base de contatos e o histórico de projetos de cada um.',
    grupo: 'Cadastros',
  },
  {
    codigo: 'cadastros.editar',
    rotulo: 'Editar clientes e parceiros',
    descricao: 'Corrigir nome, contato e endereço na base.',
    grupo: 'Cadastros',
  },

  // -------------------------------------------------------------- financeiro
  {
    codigo: 'fin.salarios.ver',
    rotulo: 'Ver salários e custo da equipe',
    descricao: 'Quanto cada pessoa custa por hora e por mês.',
    grupo: 'Financeiro',
    sensivel: true,
  },
  {
    codigo: 'fin.salarios.editar',
    rotulo: 'Editar salários',
    descricao: 'Cadastrar e alterar o custo de cada pessoa.',
    grupo: 'Financeiro',
    sensivel: true,
  },
  {
    codigo: 'fin.contrato.ver',
    rotulo: 'Ver valor de contrato e parcelas',
    descricao: 'Quanto o escritório cobrou por cada projeto e como recebe.',
    grupo: 'Financeiro',
    sensivel: true,
  },
  {
    codigo: 'fin.contrato.editar',
    rotulo: 'Editar contrato e parcelas',
    descricao: 'Lançar o valor fechado e o parcelamento.',
    grupo: 'Financeiro',
    sensivel: true,
  },
  {
    codigo: 'fin.despesas.ver',
    rotulo: 'Ver despesas e custos indiretos',
    descricao: 'As despesas lançadas em cada projeto.',
    grupo: 'Financeiro',
  },
  {
    codigo: 'fin.despesas.editar',
    rotulo: 'Lançar despesas e custos indiretos',
    descricao: 'Incluir e corrigir despesa de projeto. É o mínimo de quem só lança custo.',
    grupo: 'Financeiro',
  },
  {
    codigo: 'fin.relatorio.ver',
    rotulo: 'Ver margem e relatório financeiro',
    descricao: 'Lucro por projeto e o painel financeiro do escritório.',
    grupo: 'Financeiro',
    sensivel: true,
  },

  // -------------------------------------------------------------------- ponto
  {
    codigo: 'ponto.ver_equipe',
    rotulo: 'Ver o ponto da equipe',
    descricao: 'Espelho e banco de horas de todo mundo, sem poder alterar.',
    grupo: 'Cartão ponto',
  },
  {
    codigo: 'ponto.administrar',
    rotulo: 'Administrar o ponto',
    descricao: 'Ajustar batidas, cadastrar jornada e PIN, aprovar horário diferente.',
    grupo: 'Cartão ponto',
    sensivel: true,
  },

  // -------------------------------------------------------------- visão geral
  {
    codigo: 'dashboard.ver',
    rotulo: 'Ver dashboard e ranking',
    descricao: 'Gráficos, meta de pontos e ranking da equipe.',
    grupo: 'Visão geral',
  },
  {
    codigo: 'relatorios.ver',
    rotulo: 'Ver relatórios',
    descricao: 'Pendências, tarefas em aberto, projetos sem planejamento.',
    grupo: 'Visão geral',
  },
  {
    codigo: 'humor.ver',
    rotulo: 'Ver humor da equipe',
    descricao: 'O painel de humor e o histórico.',
    grupo: 'Visão geral',
  },

  // -------------------------------------------------------------- comercial
  {
    codigo: 'comercial.ver',
    rotulo: 'Ver o comercial',
    descricao: 'Funil de vendas, leads e histórico de negociação.',
    grupo: 'Comercial',
  },
  {
    codigo: 'comercial.editar',
    rotulo: 'Trabalhar no comercial',
    descricao: 'Criar lead, mover de etapa, registrar contato e anotar.',
    grupo: 'Comercial',
  },
  {
    codigo: 'comercial.converter',
    rotulo: 'Transformar lead em projeto',
    descricao: 'O botão "Vendeu": cria o cartão na gestão e liga os dois.',
    grupo: 'Comercial',
    sensivel: true,
  },

  // ---------------------------------------------------------- administração
  {
    codigo: 'equipe.editar',
    rotulo: 'Editar equipe e categorias',
    descricao: 'Incluir e desativar pessoas, mexer nas categorias de tarefa.',
    grupo: 'Administração',
  },
  {
    codigo: 'permissoes.gerenciar',
    rotulo: 'Gerenciar permissões',
    descricao: 'Criar perfis e decidir o que cada um pode. Dá acesso a tudo indiretamente.',
    grupo: 'Administração',
    sensivel: true,
  },
]

export const GRUPOS = Array.from(new Set(PERMISSOES.map((p) => p.grupo)))

export function permissaoPorCodigo(codigo: string): Permissao | undefined {
  return PERMISSOES.find((p) => p.codigo === codigo)
}

export type PerfilDeAcesso = {
  id: string
  nome: string
  descricao: string | null
  sistema: boolean
  ordem: number
}

export async function carregarPerfis(): Promise<PerfilDeAcesso[]> {
  const { data } = await supabase.from('access_roles').select('*').order('ordem').order('nome')
  return (data as PerfilDeAcesso[]) || []
}

export async function carregarPermissoesDosPerfis(): Promise<Map<string, Set<string>>> {
  const { data } = await supabase.from('access_role_permissions').select('role_id, permissao')
  const mapa = new Map<string, Set<string>>()
  for (const r of (data as { role_id: string; permissao: string }[]) || []) {
    if (!mapa.has(r.role_id)) mapa.set(r.role_id, new Set())
    mapa.get(r.role_id)!.add(r.permissao)
  }
  return mapa
}

export type Excecao = { user_id: string; permissao: string; concedida: boolean; motivo: string | null }

export async function carregarExcecoes(): Promise<Excecao[]> {
  const { data } = await supabase.from('access_user_overrides').select('*')
  return (data as Excecao[]) || []
}

export async function definirPermissaoDoPerfil(roleId: string, permissao: string, ligada: boolean) {
  if (ligada) {
    const { error } = await supabase
      .from('access_role_permissions')
      .upsert({ role_id: roleId, permissao }, { onConflict: 'role_id,permissao' })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('access_role_permissions')
      .delete()
      .eq('role_id', roleId)
      .eq('permissao', permissao)
    if (error) throw new Error(error.message)
  }
}

/** `null` remove a exceção e a pessoa volta a seguir o perfil. */
export async function definirExcecao(
  userId: string,
  permissao: string,
  concedida: boolean | null
) {
  if (concedida === null) {
    const { error } = await supabase
      .from('access_user_overrides')
      .delete()
      .eq('user_id', userId)
      .eq('permissao', permissao)
    if (error) throw new Error(error.message)
    return
  }
  const email = (await supabase.auth.getUser()).data.user?.email
  const { error } = await supabase
    .from('access_user_overrides')
    .upsert(
      { user_id: userId, permissao, concedida, definido_por: email, definido_em: new Date().toISOString() },
      { onConflict: 'user_id,permissao' }
    )
  if (error) throw new Error(error.message)
}

export async function criarPerfil(nome: string, descricao: string) {
  const { data, error } = await supabase
    .from('access_roles')
    .insert({ nome: nome.trim(), descricao: descricao.trim() || null })
    .select('*')
    .single()
  if (error) {
    if (/duplicate|unique/i.test(error.message)) throw new Error('Já existe um perfil com esse nome.')
    throw new Error(error.message)
  }
  return data as PerfilDeAcesso
}

export async function excluirPerfil(id: string) {
  const { error } = await supabase.from('access_roles').delete().eq('id', id)
  if (error) {
    if (/foreign key/i.test(error.message)) {
      throw new Error('Há pessoas usando este perfil. Mude o perfil delas antes de apagar.')
    }
    throw new Error(error.message)
  }
}

export async function definirPerfilDoUsuario(userId: string, roleId: string) {
  const { error } = await supabase
    .from('user_profiles')
    .update({ role_id: roleId, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}

/**
 * As permissões de quem está logado.
 *
 * Vem de uma função do banco que já resolve perfil + exceções, para a tela
 * nunca discordar da RLS.
 */
export function usePermissoes() {
  const [permissoes, setPermissoes] = useState<Set<string>>(new Set())
  const [ehProprietario, setEhProprietario] = useState(false)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let ativo = true
    ;(async () => {
      const { data: sessao } = await supabase.auth.getUser()
      if (!sessao.user) {
        if (ativo) setCarregando(false)
        return
      }

      const [{ data: perfil }, { data: lista }] = await Promise.all([
        supabase.from('user_profiles').select('papel').eq('user_id', sessao.user.id).maybeSingle(),
        supabase.rpc('minhas_permissoes'),
      ])

      if (!ativo) return
      const dono = (perfil as { papel: string } | null)?.papel === 'proprietario'
      setEhProprietario(dono)
      setPermissoes(new Set(((lista as string[]) || []).map(String)))
      setCarregando(false)
    })()
    return () => {
      ativo = false
    }
  }, [])

  /** O dono do escritório passa por tudo — é o que evita ele se trancar fora. */
  function pode(codigo: string): boolean {
    return ehProprietario || permissoes.has(codigo)
  }

  return { pode, permissoes, ehProprietario, carregando }
}
