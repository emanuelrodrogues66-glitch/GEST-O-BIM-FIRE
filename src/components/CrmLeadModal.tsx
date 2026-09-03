import { useEffect, useState } from 'react'
import type { AtividadeLead, Etapa, Funil, Lead, Sugestao } from '../lib/crm'
import {
  MOTIVOS_PERDA,
  TIPOS_ATIVIDADE,
  carregarAtividades,
  converterEmProjeto,
  dataBR,
  ajustarComissao,
  excluirLeads,
  ligarAoProjeto,
  moverEtapa,
  reais,
  registrarAtividade,
  salvarLead,
  sugerirProjetos,
} from '../lib/crm'
import { usePermissoes } from '../lib/permissoes'
import BuscaCadastro from './BuscaCadastro'
import CrmProposta from './CrmProposta'
import { TIPOS_DE_SERVICO, categoriaDoTipo } from '../types'

/**
 * O cartão do lead.
 *
 * Enquanto não vende, ele só tem ferramenta comercial: dados de quem é,
 * histórico de contatos e o valor em jogo. O projeto só nasce no clique de
 * "Vendeu" — antes disso, não existe cartão de projeto pela metade
 * atravessado no Kanban dos projetistas.
 */
export default function CrmLeadModal({
  lead,
  funis,
  etapas,
  onFechar,
  onMudou,
  onAbrirProjeto,
}: {
  lead: Lead
  funis: Funil[]
  etapas: Etapa[]
  onFechar: () => void
  onMudou: () => void
  onAbrirProjeto?: (id: string) => void
}) {
  const { pode } = usePermissoes()
  const podeEditar = pode('comercial.editar')
  const podeConverter = pode('comercial.converter')
  const podeExcluir = pode('comercial.excluir')
  const veComissao = pode('comercial.comissao')

  const [form, setForm] = useState<Lead>(lead)
  const [atividades, setAtividades] = useState<AtividadeLead[]>([])
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([])
  const [texto, setTexto] = useState('')
  const [tipoAtividade, setTipoAtividade] = useState('nota')
  const [salvando, setSalvando] = useState(false)
  const [propondo, setPropondo] = useState(false)

  const doFunil = etapas.filter((e) => e.funnel_id === form.funnel_id)
  const etapaAtual = etapas.find((e) => e.id === form.stage_id)

  useEffect(() => {
    carregarAtividades(lead.id).then(setAtividades)
    if (!lead.project_id) sugerirProjetos(lead.id).then(setSugestoes)
  }, [lead.id, lead.project_id])

  async function campo(patch: Partial<Lead>) {
    setForm((f) => ({ ...f, ...patch }))
    if (!podeEditar) return
    try {
      await salvarLead(lead.id, patch)
      onMudou()
    } catch (e: any) {
      alert(e.message)
    }
  }

  async function trocarEtapa(id: string) {
    const nova = etapas.find((e) => e.id === id)
    if (!nova) return
    if (nova.tipo === 'perdido' && !form.motivo_perda) {
      const motivo = prompt(
        `Por que perdeu?\n\n${MOTIVOS_PERDA.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n\nEscreva o motivo:`
      )
      if (!motivo?.trim()) return
      await campo({ motivo_perda: motivo.trim() })
    }
    try {
      await moverEtapa(form, nova, etapaAtual)
      setForm((f) => ({ ...f, stage_id: nova.id, estado: nova.tipo === 'aberta' ? 'aberta' : nova.tipo }))
      setAtividades(await carregarAtividades(lead.id))
      onMudou()
    } catch (e: any) {
      alert(e.message)
    }
  }

  async function excluir() {
    const aviso = form.project_id
      ? 'Este negócio já virou projeto. Desligue do projeto antes de apagar.'
      : `Apagar "${form.nome}" e todo o histórico dele? Não tem desfazer.`
    if (form.project_id) return alert(aviso)
    if (!confirm(aviso)) return
    try {
      await excluirLeads([lead.id])
      onMudou()
      onFechar()
    } catch (e: any) {
      alert(e.message)
    }
  }

  async function anotar() {
    if (!texto.trim()) return
    await registrarAtividade(lead.id, tipoAtividade, texto.trim())
    setTexto('')
    setAtividades(await carregarAtividades(lead.id))
  }

  async function vender() {
    const tipo = prompt(
      `Tipo do serviço:\n${TIPOS_DE_SERVICO.join(', ')}`,
      TIPOS_DE_SERVICO[0]
    )
    if (!tipo) return
    const responsavel = prompt('Quem vai tocar o projeto? (pode deixar em branco)') || null
    const prazo = prompt('Prazo de entrega (AAAA-MM-DD, opcional):') || null

    setSalvando(true)
    try {
      const projeto = await converterEmProjeto({
        leadId: lead.id,
        tipo,
        // Vistoria, SPDA e TCAC nascem na carteira própria, não na fila de projetos.
        categoria: categoriaDoTipo(tipo),
        responsavel,
        dataPrazo: prazo,
      })
      onMudou()
      if (confirm('Projeto criado. Abrir o cartão agora?')) onAbrirProjeto?.(projeto)
      else onFechar()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-auto">
      {propondo && (
        <CrmProposta
          lead={form}
          onFechar={() => setPropondo(false)}
          onMudou={() => {
            carregarAtividades(lead.id).then(setAtividades)
            onMudou()
          }}
        />
      )}
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl my-8">
        {/* ---------- cabeçalho ---------- */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <input
              value={form.nome}
              disabled={!podeEditar}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              onBlur={() => campo({ nome: form.nome })}
              className="w-full text-lg font-semibold text-slate-800 border-none outline-none disabled:bg-transparent"
            />
            <p className="text-[11px] text-slate-400">
              {form.origem === 'rd' ? 'veio do RD Station' : form.origem === 'planilha' ? 'veio da planilha' : 'criado aqui'}
              {' · '}aberto em {dataBR(form.criado_em)}
              {form.responsavel && ` · ${form.responsavel}`}
            </p>
          </div>

          {podeEditar && (
            <button
              onClick={() => setPropondo(true)}
              title="Monta a proposta no modelo do escritório"
              className="text-[11px] font-medium px-3 py-1.5 rounded-lg border border-slate-300 hover:border-slate-400 text-slate-700"
            >
              📄 Proposta
            </button>
          )}

          {form.project_id ? (
            <button
              onClick={() => onAbrirProjeto?.(form.project_id!)}
              className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Abrir projeto ↗
            </button>
          ) : (
            podeConverter && (
              <button
                onClick={vender}
                disabled={salvando}
                className="text-xs font-semibold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white"
              >
                {salvando ? 'Criando...' : '✓ Vendeu'}
              </button>
            )
          )}
          <button onClick={onFechar} className="text-slate-400 hover:text-slate-700 px-1 text-xl">
            ×
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-5 p-5">
          {/* ---------- coluna esquerda: quem é e quanto vale ---------- */}
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Select
                rotulo="Funil"
                valor={form.funnel_id || ''}
                opcoes={funis.map((f) => [f.id, f.nome])}
                onMudar={(v) => campo({ funnel_id: v, stage_id: null })}
                travado={!podeEditar}
              />
              <Select
                rotulo="Etapa"
                valor={form.stage_id || ''}
                opcoes={doFunil.map((e) => [e.id, e.nome])}
                onMudar={trocarEtapa}
                travado={!podeEditar}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <BuscaCadastro
                tipo="cliente"
                valor={form.nome_cliente}
                travado={!podeEditar}
                onEscolher={(e) => {
                  campo({
                    nome_cliente: e.nome || null,
                    cliente_id: e.id,
                    // completa só o que está em branco: não sobrescreve o que já foi anotado
                    ...(!form.contato && e.contato ? { contato: e.contato } : {}),
                    ...(!form.email && e.email ? { email: e.email } : {}),
                    ...(!form.cidade && e.cidade ? { cidade: e.cidade } : {}),
                  })
                }}
              />
              <BuscaCadastro
                tipo="parceiro"
                valor={form.nome_parceiro}
                travado={!podeEditar}
                onEscolher={(e) =>
                  campo({
                    nome_parceiro: e.nome || null,
                    parceiro_id: e.id,
                    ...(!form.contato && e.contato ? { contato: e.contato } : {}),
                    ...(!form.email && e.email ? { email: e.email } : {}),
                  })
                }
              />
              <Campo rotulo="Contato" valor={form.contato} onSalvar={(v) => campo({ contato: v })} travado={!podeEditar} />
              <Campo rotulo="E-mail" valor={form.email} onSalvar={(v) => campo({ email: v })} travado={!podeEditar} />
              <Campo rotulo="Cidade" valor={form.cidade} onSalvar={(v) => campo({ cidade: v })} travado={!podeEditar} />
              <Campo rotulo="Fonte" valor={form.fonte} onSalvar={(v) => campo({ fonte: v })} travado={!podeEditar} />
              <Campo rotulo="Responsável pela negociação" valor={form.responsavel} onSalvar={(v) => campo({ responsavel: v })} travado={!podeEditar} />
              <Campo rotulo="Fechado em" valor={form.data_fechamento} tipo="date" onSalvar={(v) => campo({ data_fechamento: v || null })} travado={!podeEditar} />
            </div>

            <div className="border border-slate-200 rounded-lg p-3 space-y-2">
              <p className="text-[10px] font-semibold uppercase text-slate-400">O negócio</p>
              <div className="grid grid-cols-2 gap-2">
                <Campo rotulo="Nome do projeto" valor={form.nome_projeto} onSalvar={(v) => campo({ nome_projeto: v })} travado={!podeEditar} />
                <Campo rotulo="Área (m²)" valor={form.area_m2?.toString() || ''} onSalvar={(v) => campo({ area_m2: v ? Number(v) : null })} travado={!podeEditar} />
                <Campo rotulo="Valor proposto" valor={form.valor?.toString() || ''} onSalvar={(v) => campo({ valor: v ? Number(v) : null })} travado={!podeEditar} />
                <Campo rotulo="Valor fechado" valor={form.valor_fechado?.toString() || ''} onSalvar={(v) => campo({ valor_fechado: v ? Number(v) : null })} travado={!podeEditar} />
                <Campo rotulo="Retornar em" valor={form.retorno_em} tipo="date" onSalvar={(v) => campo({ retorno_em: v || null })} travado={!podeEditar} />
                <Campo rotulo="Nº do orçamento" valor={form.numero_orcamento} onSalvar={(v) => campo({ numero_orcamento: v })} travado={!podeEditar} />
              </div>
              {form.estado === 'perdido' && (
                <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                  Perdido: {form.motivo_perda || 'sem motivo'}
                  {form.anotacao_perda && ` — ${form.anotacao_perda}`}
                </p>
              )}
            </div>

            {/* ---------- comissão ---------- */}
            {veComissao && form.estado === 'ganho' && (
              <div className="border border-emerald-200 bg-emerald-50/40 rounded-lg p-3">
                <p className="text-[10px] font-semibold uppercase text-emerald-800">Comissão</p>
                <p className="text-[10px] text-slate-500 mb-1.5">
                  {form.tipo_venda === 'memorial'
                    ? 'Memorial simplificado: paga o excedente.'
                    : form.tipo_venda === 'recompra'
                      ? 'Cliente que já comprou'
                      : 'Cliente novo'}
                  {form.comissao_percentual
                    ? ` · ${(form.comissao_percentual * 100).toLocaleString('pt-BR')}%`
                    : form.comissao_valor === null && !form.comissao_manual
                      ? ' · sem regra vigente na data do fechamento'
                      : ''}
                  {form.comissao_manual && ' · ajustada à mão'}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-emerald-700 tabular-nums">
                    {reais(form.comissao_valor)}
                  </span>
                  <span className="text-[10px] text-slate-500 flex-1">
                    sobre {reais(form.valor_fechado ?? form.valor)} · {form.responsavel || 'sem responsável'}
                  </span>
                  <button
                    onClick={async () => {
                      const v = prompt(
                        'Valor da comissão (deixe vazio para voltar ao cálculo automático):',
                        form.comissao_valor?.toString() || ''
                      )
                      if (v === null) return
                      const n = v.trim() === '' ? null : Number(v.replace(',', '.'))
                      if (n !== null && Number.isNaN(n)) return alert('Valor inválido.')
                      await ajustarComissao(lead.id, { valor: n })
                      setForm((f) => ({ ...f, comissao_valor: n, comissao_manual: n !== null }))
                      onMudou()
                    }}
                    className="text-[10px] text-slate-500 hover:underline"
                  >
                    ajustar
                  </button>
                </div>
                {form.comissao_paga_em && (
                  <p className="text-[10px] text-emerald-700 mt-1">
                    Paga em {dataBR(form.comissao_paga_em)}
                  </p>
                )}
              </div>
            )}

            {/* ---------- ligação com a gestão ---------- */}
            {!form.project_id && sugestoes.length > 0 && (
              <div className="border border-cobre-300 bg-cobre-50/40 rounded-lg p-3">
                <p className="text-[10px] font-semibold uppercase text-cobre-700">
                  Já existe projeto para este negócio?
                </p>
                <p className="text-[10px] text-slate-500 mb-2">
                  Sugestões por semelhança de nome. Confira antes de ligar — nome parecido não é
                  garantia de ser o mesmo.
                </p>
                <div className="space-y-1">
                  {sugestoes.map((s) => (
                    <button
                      key={s.id}
                      onClick={async () => {
                        if (!confirm(`Ligar este lead ao projeto "${s.nome}"?`)) return
                        await ligarAoProjeto(lead.id, s.id)
                        setForm((f) => ({ ...f, project_id: s.id }))
                        onMudou()
                      }}
                      className="w-full text-left text-[11px] px-2 py-1.5 rounded border border-slate-200 bg-white hover:border-cobre-500 flex items-center gap-2"
                    >
                      <span className="text-slate-400 tabular-nums w-8">{s.numero ?? ''}</span>
                      <span className="flex-1 truncate text-slate-700">{s.nome}</span>
                      <span className="text-[9px] text-slate-400 tabular-nums">
                        {Math.round(s.semelhanca * 100)}%
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ---------- coluna direita: histórico ---------- */}
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-semibold uppercase text-slate-400 mb-1.5">
                Registrar contato
              </p>
              <div className="flex gap-1 mb-1.5 flex-wrap">
                {TIPOS_ATIVIDADE.map((t) => (
                  <button
                    key={t.valor}
                    onClick={() => setTipoAtividade(t.valor)}
                    className={`text-[10px] px-2 py-1 rounded border transition ${
                      tipoAtividade === t.valor
                        ? 'bg-slate-800 text-white border-transparent'
                        : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    {t.emoji} {t.rotulo}
                  </button>
                ))}
              </div>
              <textarea
                value={texto}
                disabled={!podeEditar}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="O que foi combinado, o que falta, quando retornar..."
                rows={3}
                className="w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 disabled:bg-slate-50"
              />
              <button
                onClick={anotar}
                disabled={!podeEditar || !texto.trim()}
                className="mt-1 w-full py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white"
              >
                Registrar
              </button>
            </div>

            <div className="border-t border-slate-100 pt-2 max-h-[380px] overflow-auto space-y-2">
              {atividades.length === 0 && (
                <p className="text-[11px] text-slate-400 text-center py-4">
                  Nenhum contato registrado ainda.
                </p>
              )}
              {atividades.map((a) => {
                const t = TIPOS_ATIVIDADE.find((x) => x.valor === a.tipo)
                return (
                  <div key={a.id} className="text-[11px] border-l-2 border-slate-200 pl-2">
                    <p className="text-slate-400">
                      {t?.emoji || '•'} {t?.rotulo || a.tipo} ·{' '}
                      {new Date(a.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      {a.quem && ` · ${a.quem.split('@')[0]}`}
                    </p>
                    <p className="text-slate-700 whitespace-pre-wrap">{a.texto}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex items-center gap-3 text-[11px] text-slate-500">
          <span>
            Proposto <strong className="text-slate-700">{reais(form.valor)}</strong>
          </span>
          {form.valor_fechado !== null && (
            <span>
              Fechado <strong className="text-emerald-700">{reais(form.valor_fechado)}</strong>
            </span>
          )}
          {podeExcluir && (
            <button onClick={excluir} className="text-red-700 hover:underline">
              Excluir negociação
            </button>
          )}
          <button onClick={onFechar} className="ml-auto px-3 py-1.5 rounded-lg border border-slate-300">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

function Campo({
  rotulo,
  valor,
  tipo = 'text',
  onSalvar,
  travado,
}: {
  rotulo: string
  valor: string | null
  tipo?: string
  onSalvar: (v: string) => void
  travado?: boolean
}) {
  const [v, setV] = useState(valor || '')
  useEffect(() => setV(valor || ''), [valor])
  return (
    <label className="block">
      <span className="text-[10px] uppercase text-slate-400">{rotulo}</span>
      <input
        type={tipo}
        value={v}
        disabled={travado}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== (valor || '') && onSalvar(v)}
        className="w-full mt-0.5 text-xs border border-slate-300 rounded-md px-2 py-1.5 disabled:bg-slate-50"
      />
    </label>
  )
}

function Select({
  rotulo,
  valor,
  opcoes,
  onMudar,
  travado,
}: {
  rotulo: string
  valor: string
  opcoes: [string, string][]
  onMudar: (v: string) => void
  travado?: boolean
}) {
  return (
    <label className="block flex-1 min-w-[140px]">
      <span className="text-[10px] uppercase text-slate-400">{rotulo}</span>
      <select
        value={valor}
        disabled={travado}
        onChange={(e) => onMudar(e.target.value)}
        className="w-full mt-0.5 text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white disabled:bg-slate-50"
      >
        <option value="">—</option>
        {opcoes.map(([id, nome]) => (
          <option key={id} value={id}>
            {nome}
          </option>
        ))}
      </select>
    </label>
  )
}
