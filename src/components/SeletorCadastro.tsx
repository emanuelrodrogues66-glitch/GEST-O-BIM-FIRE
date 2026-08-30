import { useEffect, useMemo, useState } from 'react'
import type { ProjectClient } from '../types'
import type { Cliente, Parceiro } from '../lib/cadastros'
import {
  camposDoCliente,
  camposDoParceiro,
  carregarClientes,
  carregarParceiros,
  divergencias,
  salvarClienteDoCartao,
  salvarParceiroDoCartao,
} from '../lib/cadastros'

/** Normaliza para busca: sem acento, sem caixa. */
function chave(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Escolha de cliente e parceiro a partir da base já cadastrada.
 *
 * ELIAS aparece em 7 projetos, Juliana Boeira em 6 — cada um redigitado do
 * zero. Aqui basta digitar duas letras e escolher: contato, e-mail, CNPJ e
 * endereço vêm junto.
 */
export default function SeletorCadastro({
  value,
  onChange,
}: {
  value: Partial<ProjectClient>
  onChange: (patch: Partial<ProjectClient>) => void
}) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [parceiros, setParceiros] = useState<Parceiro[]>([])
  const [buscaCliente, setBuscaCliente] = useState('')
  const [buscaParceiro, setBuscaParceiro] = useState('')
  const [salvando, setSalvando] = useState('')
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    recarregar()
  }, [])

  async function recarregar() {
    const [c, p] = await Promise.all([carregarClientes(), carregarParceiros()])
    setClientes(c)
    setParceiros(p)
  }

  const clienteAtual = useMemo(
    () => clientes.find((c) => c.id === value.cliente_id) || null,
    [clientes, value.cliente_id]
  )

  const achadosCliente = useMemo(() => {
    const q = chave(buscaCliente)
    if (q.length < 2) return []
    return clientes.filter((c) => chave(c.nome).includes(q)).slice(0, 6)
  }, [clientes, buscaCliente])

  const achadosParceiro = useMemo(() => {
    const q = chave(buscaParceiro)
    if (q.length < 2) return []
    return parceiros.filter((p) => chave(p.nome).includes(q)).slice(0, 6)
  }, [parceiros, buscaParceiro])

  const diferencas = divergencias(value, clienteAtual)

  async function gravarNoCadastro(tipo: 'cliente' | 'parceiro') {
    setSalvando(tipo)
    setAviso('')
    try {
      if (tipo === 'cliente') {
        const c = await salvarClienteDoCartao(value)
        if (c) onChange({ cliente_id: c.id })
        setAviso('Cliente salvo no cadastro.')
      } else {
        const p = await salvarParceiroDoCartao(value)
        if (p) onChange({ parceiro_id: p.id })
        setAviso('Parceiro salvo no cadastro.')
      }
      await recarregar()
    } catch (e: any) {
      setAviso(e.message || 'Não foi possível salvar no cadastro.')
    } finally {
      setSalvando('')
      setTimeout(() => setAviso(''), 3000)
    }
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3 mb-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-xs font-semibold text-slate-700">Buscar no cadastro</h4>
        <span className="text-[10px] text-slate-400">
          {clientes.length} clientes · {parceiros.length} parceiros
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {/* ---------- Cliente ---------- */}
        <div>
          <label className="block text-[10px] font-medium text-slate-500 mb-1">Cliente</label>
          <input
            value={buscaCliente}
            onChange={(e) => setBuscaCliente(e.target.value)}
            placeholder="Digite duas letras do nome"
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
          />

          {achadosCliente.length > 0 && (
            <div className="mt-1 border border-slate-200 rounded-md bg-white divide-y divide-slate-100">
              {achadosCliente.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    onChange(camposDoCliente(c))
                    setBuscaCliente('')
                  }}
                  className="w-full text-left px-2 py-1.5 hover:bg-indigo-50"
                >
                  <span className="text-xs font-medium text-slate-800">{c.nome}</span>
                  {(c.contato || c.cidade) && (
                    <span className="block text-[10px] text-slate-400">
                      {[c.contato, c.cidade].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {value.nome_responsavel && (
            <p className="text-[10px] text-slate-500 mt-1">
              No cartão: <b>{value.nome_responsavel}</b>
              {!value.cliente_id && ' — ainda não está no cadastro'}
            </p>
          )}

          <button
            onClick={() => gravarNoCadastro('cliente')}
            disabled={!value.nome_responsavel || salvando === 'cliente'}
            className="text-[10px] text-indigo-600 hover:underline disabled:text-slate-300 mt-0.5"
          >
            {value.cliente_id ? 'atualizar o cadastro com estes dados' : 'salvar no cadastro'}
          </button>
        </div>

        {/* ---------- Parceiro ---------- */}
        <div>
          <label className="block text-[10px] font-medium text-slate-500 mb-1">Parceiro</label>
          <input
            value={buscaParceiro}
            onChange={(e) => setBuscaParceiro(e.target.value)}
            placeholder="Digite duas letras do nome"
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
          />

          {achadosParceiro.length > 0 && (
            <div className="mt-1 border border-slate-200 rounded-md bg-white divide-y divide-slate-100">
              {achadosParceiro.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onChange(camposDoParceiro(p))
                    setBuscaParceiro('')
                  }}
                  className="w-full text-left px-2 py-1.5 hover:bg-indigo-50"
                >
                  <span className="text-xs font-medium text-slate-800">{p.nome}</span>
                  {p.contato && (
                    <span className="block text-[10px] text-slate-400">{p.contato}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {value.nome_parceiro && (
            <p className="text-[10px] text-slate-500 mt-1">
              No cartão: <b>{value.nome_parceiro}</b>
              {!value.parceiro_id && ' — ainda não está no cadastro'}
            </p>
          )}

          <button
            onClick={() => gravarNoCadastro('parceiro')}
            disabled={!value.nome_parceiro || salvando === 'parceiro'}
            className="text-[10px] text-indigo-600 hover:underline disabled:text-slate-300 mt-0.5"
          >
            {value.parceiro_id ? 'atualizar o cadastro com estes dados' : 'salvar no cadastro'}
          </button>
        </div>
      </div>

      {/* O cartão divergiu do cadastro: pode ser correção, pode ser dado antigo. */}
      {diferencas.length > 0 && (
        <p className="text-[10px] text-amber-700">
          O {diferencas.join(', ')} deste cartão está diferente do cadastro. Se o dado novo é o
          certo, use "atualizar o cadastro"; se o cadastro é que está certo, escolha o cliente na
          busca acima para puxar de novo.
        </p>
      )}

      {aviso && <p className="text-[10px] text-emerald-700">{aviso}</p>}

      <p className="text-[10px] text-slate-400">
        Escolher alguém aqui <b>preenche</b> os campos abaixo. O cartão guarda a própria cópia de
        propósito: o endereço de um projeto é o endereço da época dele, e mudança no cadastro não
        pode reescrever processo já protocolado.
      </p>
    </div>
  )
}
