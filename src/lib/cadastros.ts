/**
 * Base de clientes e parceiros.
 *
 * O cadastro preenche os campos do projeto, mas não os substitui. É de
 * propósito: o endereço gravado num projeto é o endereço na época do projeto.
 * Se o cliente se mudar, os projetos antigos não podem trocar de endereço
 * sozinhos — o termo de entrega e o processo no Corpo de Bombeiros ficariam
 * divergentes do que foi protocolado.
 */

import { supabase } from './supabase'
import type { ProjectClient } from '../types'

export type Cliente = {
  id: string
  nome: string
  cnpj: string | null
  contato: string | null
  email: string | null
  endereco: string | null
  cidade: string | null
  estado: string | null
  observacao: string | null
}

export type Parceiro = {
  id: string
  nome: string
  cnpj: string | null
  contato: string | null
  email: string | null
  endereco: string | null
  observacao: string | null
}

export async function carregarClientes(): Promise<Cliente[]> {
  const { data } = await supabase.from('clientes').select('*').order('nome')
  return (data as Cliente[]) || []
}

export async function carregarParceiros(): Promise<Parceiro[]> {
  const { data } = await supabase.from('parceiros').select('*').order('nome')
  return (data as Parceiro[]) || []
}

/** Campos do projeto que o cadastro do cliente preenche. */
export function camposDoCliente(c: Cliente): Partial<ProjectClient> {
  return {
    cliente_id: c.id,
    nome_responsavel: c.nome,
    contato_responsavel: c.contato || '',
    email_cliente: c.email || '',
    cnpj: c.cnpj || '',
    endereco_completo: c.endereco || '',
    cidade: c.cidade || '',
    estado: c.estado || '',
  }
}

export function camposDoParceiro(p: Parceiro): Partial<ProjectClient> {
  return {
    parceiro_id: p.id,
    nome_parceiro: p.nome,
    contato_parceiro: p.contato || '',
    endereco_parceiro: p.endereco || '',
  }
}

/**
 * Grava no cadastro o que está no cartão.
 *
 * Serve para os dois sentidos: cliente novo entra na base, e correção de
 * telefone feita no projeto pode subir para o cadastro — mas só quando alguém
 * pede, nunca em silêncio.
 */
export async function salvarClienteDoCartao(
  ficha: Partial<ProjectClient>
): Promise<Cliente | null> {
  const nome = (ficha.nome_responsavel || '').trim()
  if (!nome) return null

  const { data, error } = await supabase
    .from('clientes')
    .upsert(
      {
        nome,
        cnpj: ficha.cnpj?.trim() || null,
        contato: ficha.contato_responsavel?.trim() || null,
        email: ficha.email_cliente?.trim() || null,
        endereco: ficha.endereco_completo?.trim() || null,
        cidade: ficha.cidade?.trim() || null,
        estado: ficha.estado?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'nome' }
    )
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data as Cliente
}

export async function salvarParceiroDoCartao(
  ficha: Partial<ProjectClient>
): Promise<Parceiro | null> {
  const nome = (ficha.nome_parceiro || '').trim()
  if (!nome || nome.toLowerCase() === 'sem parceiro') return null

  const { data, error } = await supabase
    .from('parceiros')
    .upsert(
      {
        nome,
        contato: ficha.contato_parceiro?.trim() || null,
        endereco: ficha.endereco_parceiro?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'nome' }
    )
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data as Parceiro
}

/** Diferenças entre o cartão e o cadastro, para oferecer atualização. */
export function divergencias(
  ficha: Partial<ProjectClient>,
  cliente: Cliente | null
): string[] {
  if (!cliente) return []
  const pares: [string, string | null | undefined, string | null][] = [
    ['contato', ficha.contato_responsavel, cliente.contato],
    ['e-mail', ficha.email_cliente, cliente.email],
    ['CNPJ', ficha.cnpj, cliente.cnpj],
    ['endereço', ficha.endereco_completo, cliente.endereco],
  ]
  return pares
    .filter(([, noCartao, noCadastro]) => {
      const a = (noCartao || '').trim()
      const b = (noCadastro || '').trim()
      return a && b && a !== b
    })
    .map(([campo]) => campo)
}
