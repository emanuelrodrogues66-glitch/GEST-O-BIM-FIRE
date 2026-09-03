import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Lead } from '../lib/crm'
import { registrarAtividade, salvarLead } from '../lib/crm'
import {
  ENTREGAVEIS_PADRAO,
  MEDIDAS_SEGURANCA,
  entregaveisSugeridos,
  gerarProposta,
  nomeDoArquivo,
  reaisProposta,
} from '../lib/proposta'

/**
 * Montagem da proposta comercial.
 *
 * Tudo que o sistema já sabe vem preenchido: cliente, contato, obra, área e
 * valor saem da negociação. O que sobra para a pessoa é a decisão de verdade —
 * quais medidas de segurança a edificação exige.
 *
 * O que foi proposto fica gravado junto com o arquivo. Sem isso, a proposta
 * vira um .pptx solto na pasta de downloads e ninguém consegue responder, três
 * meses depois, o que exatamente foi oferecido àquele cliente.
 */
export default function CrmProposta({
  lead,
  onFechar,
  onMudou,
}: {
  lead: Lead
  onFechar: () => void
  onMudou: () => void
}) {
  const [endereco, setEndereco] = useState(lead.endereco_obra || '')
  const [cliente, setCliente] = useState(lead.nome_cliente || lead.nome_parceiro || '')
  const [contato, setContato] = useState(lead.contato || '')
  const [obra, setObra] = useState(lead.nome_projeto || lead.nome || '')
  const [medidas, setMedidas] = useState<string[]>([])
  const [areaExistente, setAreaExistente] = useState(
    lead.area_m2 ? `${lead.area_m2.toLocaleString('pt-BR')}m²` : ''
  )
  const [areaAmpliada, setAreaAmpliada] = useState('')
  const [escopo, setEscopo] = useState<string[]>([])
  const [novoEscopo, setNovoEscopo] = useState('')
  const [entregaveis, setEntregaveis] = useState<string[]>(ENTREGAVEIS_PADRAO)
  const [entregaveisNaMao, setEntregaveisNaMao] = useState(false)
  const [prazo, setPrazo] = useState(
    '30 dias úteis após o recebimento de todas as informações necessárias (arquitetura preliminar).'
  )
  const [valor, setValor] = useState(
    (lead.valor_fechado ?? lead.valor)?.toString() || ''
  )
  const [condicoes, setCondicoes] = useState('À combinar')
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')

  /**
   * Enquanto ninguém mexer na lista à mão, os entregáveis acompanham as
   * medidas — isométrico entra com hidrante, e sai quando o hidrante sai.
   */
  useEffect(() => {
    if (!entregaveisNaMao) setEntregaveis(entregaveisSugeridos(medidas))
  }, [medidas, entregaveisNaMao])

  const valorNumero = useMemo(() => {
    const t = valor.replace(/\./g, '').replace(',', '.').trim()
    if (!t) return null
    const n = Number(t)
    return Number.isNaN(n) ? null : n
  }, [valor])

  function alternarMedida(m: string) {
    setMedidas((prev) =>
      prev.includes(m)
        ? prev.filter((x) => x !== m)
        : // Mantém a ordem da tabela do CSCIP, não a ordem dos cliques.
          MEDIDAS_SEGURANCA.filter((x) => x === m || prev.includes(x))
    )
  }

  async function gerar() {
    if (!medidas.length && !confirm('Nenhuma medida de segurança marcada. Gerar mesmo assim?'))
      return
    setGerando(true)
    setErro('')
    try {
      const dados = {
        enderecoObra: endereco.trim(),
        cliente: cliente.trim(),
        contato: contato.trim(),
        obra: obra.trim(),
        medidas,
        areaExistente: areaExistente.trim(),
        areaAmpliada: areaAmpliada.trim(),
        escopo,
        entregaveis,
        prazo: prazo.trim(),
        valor: valorNumero,
        condicoes: condicoes.trim(),
      }

      const blob = await gerarProposta(dados)
      const nome = nomeDoArquivo(cliente, 'pptx')

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nome
      a.click()
      URL.revokeObjectURL(url)

      // O endereço volta para a negociação: na próxima proposta já vem pronto.
      if (endereco.trim() && endereco.trim() !== (lead.endereco_obra || '')) {
        await salvarLead(lead.id, { endereco_obra: endereco.trim() } as Partial<Lead>)
      }

      const { data: ultima } = await supabase
        .from('crm_proposals')
        .select('versao')
        .eq('lead_id', lead.id)
        .order('versao', { ascending: false })
        .limit(1)
        .maybeSingle()

      const versao = ((ultima as { versao: number } | null)?.versao || 0) + 1
      await supabase.from('crm_proposals').insert({
        lead_id: lead.id,
        versao,
        endereco_obra: dados.enderecoObra,
        nome_cliente: dados.cliente,
        contato: dados.contato,
        obra: dados.obra,
        medidas: dados.medidas,
        area_existente: dados.areaExistente,
        area_ampliada: dados.areaAmpliada,
        escopo: dados.escopo,
        entregaveis: dados.entregaveis,
        prazo: dados.prazo,
        valor: dados.valor,
        condicoes: dados.condicoes,
        arquivo_pptx: nome,
        gerado_por: (await supabase.auth.getUser()).data.user?.email,
      })

      await registrarAtividade(
        lead.id,
        'proposta',
        `Proposta v${versao} gerada — ${reaisProposta(dados.valor)} · ${medidas.length} medida(s).`
      )
      onMudou()
      onFechar()
    } catch (e: any) {
      setErro(e.message || 'Não consegui gerar a proposta.')
    } finally {
      setGerando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-start justify-center p-4 overflow-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-800">Gerar proposta</h3>
            <p className="text-[10px] text-slate-400">
              Sai um PowerPoint no modelo do escritório, com o desenho intacto.
            </p>
          </div>
          <button onClick={onFechar} className="text-slate-400 hover:text-slate-700 text-xl px-1">
            ×
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* ---------- capa ---------- */}
          <Bloco titulo="Capa">
            <Campo rotulo="Endereço da obra" valor={endereco} onMudar={setEndereco} largo />
            <div className="grid grid-cols-2 gap-2">
              <Campo rotulo="Cliente" valor={cliente} onMudar={setCliente} />
              <Campo rotulo="Contato" valor={contato} onMudar={setContato} />
            </div>
            <Campo rotulo="Obra" valor={obra} onMudar={setObra} largo />
          </Bloco>

          {/* ---------- medidas ---------- */}
          <Bloco
            titulo={`Medidas de segurança (${medidas.length})`}
            ajuda="Na ordem da tabela do CSCIP-PR, que é a mesma que o cliente confere."
          >
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
              {MEDIDAS_SEGURANCA.map((m) => (
                <label key={m} className="flex items-start gap-1.5 text-[11px] text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={medidas.includes(m)}
                    onChange={() => alternarMedida(m)}
                    className="mt-0.5"
                  />
                  <span className={medidas.includes(m) ? 'font-medium' : ''}>{m}</span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Campo rotulo="Área total existente" valor={areaExistente} onMudar={setAreaExistente} />
              <Campo
                rotulo="Área a ser ampliada"
                valor={areaAmpliada}
                onMudar={setAreaAmpliada}
                dica="deixe vazio se não houver"
              />
            </div>
          </Bloco>

          {/* ---------- escopo ---------- */}
          <Bloco titulo="Escopo" ajuda="Fica vazio até você incluir. Cada linha é um item do slide.">
            <Lista itens={escopo} onRemover={(i) => setEscopo(escopo.filter((_, j) => j !== i))} />
            <div className="flex gap-1">
              <input
                value={novoEscopo}
                onChange={(e) => setNovoEscopo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && novoEscopo.trim()) {
                    setEscopo([...escopo, novoEscopo.trim().toUpperCase()])
                    setNovoEscopo('')
                  }
                }}
                placeholder="Escreva e tecle Enter"
                className="flex-1 border border-slate-300 rounded-md px-2 py-1.5 text-xs"
              />
              <button
                onClick={() => {
                  if (!novoEscopo.trim()) return
                  setEscopo([...escopo, novoEscopo.trim().toUpperCase()])
                  setNovoEscopo('')
                }}
                className="text-xs px-3 rounded-md border border-slate-300 hover:border-slate-400"
              >
                incluir
              </button>
            </div>
          </Bloco>

          {/* ---------- entregáveis ---------- */}
          <Bloco
            titulo="Entregáveis"
            ajuda={
              entregaveisNaMao
                ? 'Você editou a lista — ela parou de acompanhar as medidas.'
                : 'Acompanha as medidas marcadas. O isométrico entra com o hidrante.'
            }
          >
            <Lista
              itens={entregaveis}
              onRemover={(i) => {
                setEntregaveisNaMao(true)
                setEntregaveis(entregaveis.filter((_, j) => j !== i))
              }}
            />
            {entregaveisNaMao && (
              <button
                onClick={() => setEntregaveisNaMao(false)}
                className="text-[10px] text-indigo-600 hover:underline"
              >
                voltar a acompanhar as medidas
              </button>
            )}
          </Bloco>

          {/* ---------- prazo e investimento ---------- */}
          <Bloco titulo="Prazo e investimento">
            <Campo rotulo="Prazo" valor={prazo} onMudar={setPrazo} largo />
            <div className="grid grid-cols-2 gap-2">
              <Campo
                rotulo="Valor"
                valor={valor}
                onMudar={setValor}
                dica={
                  valorNumero !== null
                    ? reaisProposta(valorNumero)
                    : 'vazio sai como "A combinar"'
                }
              />
              <Campo rotulo="Condições" valor={condicoes} onMudar={setCondicoes} />
            </div>
          </Bloco>

          {erro && (
            <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {erro}
            </p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex items-center gap-2">
          <span className="text-[10px] text-slate-400 flex-1">
            O que for gerado fica registrado no histórico da negociação.
          </span>
          <button onClick={onFechar} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300">
            Cancelar
          </button>
          <button
            onClick={gerar}
            disabled={gerando}
            className="text-xs font-semibold px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white"
          >
            {gerando ? 'Gerando...' : 'Gerar PowerPoint'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Bloco({
  titulo,
  ajuda,
  children,
}: {
  titulo: string
  ajuda?: string
  children: React.ReactNode
}) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
      <div>
        <p className="text-[10px] font-semibold uppercase text-slate-500">{titulo}</p>
        {ajuda && <p className="text-[10px] text-slate-400">{ajuda}</p>}
      </div>
      {children}
    </div>
  )
}

function Campo({
  rotulo,
  valor,
  onMudar,
  largo,
  dica,
}: {
  rotulo: string
  valor: string
  onMudar: (v: string) => void
  largo?: boolean
  dica?: string
}) {
  return (
    <label className={`block ${largo ? 'w-full' : ''}`}>
      <span className="text-[10px] font-medium text-slate-500">{rotulo}</span>
      <input
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        className="w-full mt-0.5 border border-slate-300 rounded-md px-2 py-1.5 text-xs"
      />
      {dica && <span className="text-[10px] text-slate-400">{dica}</span>}
    </label>
  )
}

function Lista({ itens, onRemover }: { itens: string[]; onRemover: (i: number) => void }) {
  if (!itens.length) {
    return <p className="text-[11px] text-slate-400">Nada incluído — o slide sai em branco.</p>
  }
  return (
    <ul className="space-y-0.5">
      {itens.map((t, i) => (
        <li key={`${t}-${i}`} className="flex items-start gap-1.5 text-[11px] text-slate-700">
          <span className="text-slate-300">•</span>
          <span className="flex-1">{t}</span>
          <button
            onClick={() => onRemover(i)}
            title="Tirar da proposta"
            className="text-slate-300 hover:text-red-600 px-1"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  )
}
