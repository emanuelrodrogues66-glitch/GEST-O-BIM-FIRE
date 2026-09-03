import { useState } from 'react'
import type { Etapa, Funil, Lead } from '../lib/crm'
import { criarLead } from '../lib/crm'
import BuscaCadastro from './BuscaCadastro'

/**
 * Abertura de negociação.
 *
 * Antes era um prompt pedindo só o nome, e cliente e parceiro entravam
 * redigitados depois — que é como a base juntou "ALEX", "ALEX (PR)" e
 * "Alex - PR" como três pessoas. Aqui os dois vêm da base já cadastrada, e o
 * contato do escolhido preenche o resto.
 */
export default function CrmNovaNegociacao({
  funis,
  etapas,
  funilInicial,
  responsavelPadrao,
  onFechar,
  onCriado,
}: {
  funis: Funil[]
  etapas: Etapa[]
  funilInicial: string
  responsavelPadrao?: string
  onFechar: () => void
  onCriado: (l: Lead) => void
}) {
  const [nome, setNome] = useState('')
  const [funilId, setFunilId] = useState(funilInicial)
  const [cliente, setCliente] = useState<{ id: string | null; nome: string }>({ id: null, nome: '' })
  const [parceiro, setParceiro] = useState<{ id: string | null; nome: string }>({ id: null, nome: '' })
  const [contato, setContato] = useState('')
  const [email, setEmail] = useState('')
  const [cidade, setCidade] = useState('')
  const [valor, setValor] = useState('')
  const [salvando, setSalvando] = useState(false)

  const doFunil = etapas.filter((e) => e.funnel_id === funilId).sort((a, b) => a.ordem - b.ordem)

  /** Só preenche o que está vazio: não apaga o que a pessoa já digitou. */
  function completar(d: { contato?: string | null; email?: string | null; cidade?: string | null }) {
    if (!contato && d.contato) setContato(d.contato)
    if (!email && d.email) setEmail(d.email)
    if (!cidade && d.cidade) setCidade(d.cidade)
  }

  async function salvar() {
    const n = nome.trim() || cliente.nome.trim() || parceiro.nome.trim()
    if (!n) return alert('Dê um nome ao negócio, ou escolha o cliente.')
    setSalvando(true)
    try {
      const l = await criarLead({
        nome: n,
        funnel_id: funilId,
        stage_id: doFunil[0]?.id,
        origem: 'app',
        responsavel: responsavelPadrao || null,
        nome_cliente: cliente.nome.trim() || null,
        cliente_id: cliente.id,
        nome_parceiro: parceiro.nome.trim() || null,
        parceiro_id: parceiro.id,
        contato: contato.trim() || null,
        email: email.trim() || null,
        cidade: cidade.trim() || null,
        valor: valor.trim() ? Number(valor.replace(/\./g, '').replace(',', '.')) : null,
      })
      onCriado(l)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-12">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center">
          <h3 className="text-sm font-semibold text-slate-800 flex-1">Nova negociação</h3>
          <button onClick={onFechar} className="text-slate-400 hover:text-slate-700 text-xl px-1">
            ×
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
              Nome do negócio
            </label>
            <input
              value={nome}
              autoFocus
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Galpão logístico — Almirante Tamandaré"
              className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
            />
            <p className="text-[10px] text-slate-400 mt-0.5">
              Se deixar vazio, usa o nome do cliente.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <BuscaCadastro
              tipo="cliente"
              valor={cliente.nome}
              onEscolher={(e) => {
                setCliente({ id: e.id, nome: e.nome })
                completar(e)
              }}
            />
            <BuscaCadastro
              tipo="parceiro"
              valor={parceiro.nome}
              onEscolher={(e) => {
                setParceiro({ id: e.id, nome: e.nome })
                completar(e)
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Contato" valor={contato} onMudar={setContato} />
            <Campo rotulo="E-mail" valor={email} onMudar={setEmail} />
            <Campo rotulo="Cidade" valor={cidade} onMudar={setCidade} />
            <Campo rotulo="Valor proposto" valor={valor} onMudar={setValor} />
          </div>

          <div>
            <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Funil</label>
            <select
              value={funilId}
              onChange={(e) => setFunilId(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs bg-white"
            >
              {funis.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
            {doFunil[0] && (
              <p className="text-[10px] text-slate-400 mt-0.5">Entra em “{doFunil[0].nome}”.</p>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex gap-2 justify-end">
          <button onClick={onFechar} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="text-xs font-semibold px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white"
          >
            {salvando ? 'Criando...' : 'Criar negociação'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Campo({
  rotulo,
  valor,
  onMudar,
}: {
  rotulo: string
  valor: string
  onMudar: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-medium text-slate-500">{rotulo}</span>
      <input
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        className="w-full mt-0.5 border border-slate-300 rounded-md px-2 py-1.5 text-xs"
      />
    </label>
  )
}
