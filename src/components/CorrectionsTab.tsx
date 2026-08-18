import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { exportElementToPdf } from '../lib/pdfExport'
import type { Project, ProjectClient, ProjectCorrection, ProjectCorrectionItem } from '../types'
import { OFICIO_CIDADE_PADRAO, OFICIO_DESTINATARIO_PADRAO } from '../types'
import OficioView from './OficioView'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function formatDateBR(d: string | null): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export default function CorrectionsTab({
  project,
  client,
}: {
  project: Project
  client: Partial<ProjectClient>
}) {
  const [corrections, setCorrections] = useState<ProjectCorrection[]>([])
  const [itens, setItens] = useState<Record<string, ProjectCorrectionItem[]>>({})
  const [loading, setLoading] = useState(true)
  const [abertas, setAbertas] = useState<Set<string>>(new Set())
  const [erro, setErro] = useState<string | null>(null)
  const [gerando, setGerando] = useState<string | null>(null)
  const [oficioId, setOficioId] = useState<string | null>(null)
  const oficioRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  async function load() {
    setLoading(true)
    const { data: corrs } = await supabase
      .from('project_corrections')
      .select('*')
      .eq('project_id', project.id)
      .order('numero', { ascending: true })

    const lista = (corrs as ProjectCorrection[]) || []
    setCorrections(lista)

    if (lista.length > 0) {
      const { data: its } = await supabase
        .from('project_correction_items')
        .select('*')
        .in(
          'correction_id',
          lista.map((c) => c.id)
        )
        .order('numero', { ascending: true })

      const mapa: Record<string, ProjectCorrectionItem[]> = {}
      ;(its as ProjectCorrectionItem[] | null)?.forEach((i) => {
        if (!mapa[i.correction_id]) mapa[i.correction_id] = []
        mapa[i.correction_id].push(i)
      })
      setItens(mapa)

      // Deixa a correção mais recente já aberta.
      setAbertas(new Set([lista[lista.length - 1].id]))
    }
    setLoading(false)
  }

  function toggleAberta(id: string) {
    setAbertas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function addCorrecao() {
    setErro(null)
    const proximoNumero = corrections.length > 0 ? Math.max(...corrections.map((c) => c.numero)) + 1 : 1

    // Herda cidade e destinatário da correção anterior: você configura uma vez
    // e as próximas já vêm preenchidas.
    const anterior = corrections[corrections.length - 1]

    const { data, error } = await supabase
      .from('project_corrections')
      .insert({
        project_id: project.id,
        numero: proximoNumero,
        data: todayStr(),
        cidade: anterior?.cidade || OFICIO_CIDADE_PADRAO,
        destinatario: anterior?.destinatario || OFICIO_DESTINATARIO_PADRAO,
      })
      .select()
      .single()
    if (error) {
      setErro(error.message)
      return
    }
    const nova = data as ProjectCorrection
    setCorrections((prev) => [...prev, nova])
    setItens((prev) => ({ ...prev, [nova.id]: [] }))
    setAbertas(new Set([nova.id]))
  }

  async function updateCorrecao(id: string, patch: Partial<ProjectCorrection>) {
    setCorrections((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    const { error } = await supabase
      .from('project_corrections')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) setErro(error.message)
  }

  async function removeCorrecao(c: ProjectCorrection) {
    if (!confirm(`Excluir a ${c.numero}ª correção e todos os seus itens? Essa ação não pode ser desfeita.`))
      return
    setCorrections((prev) => prev.filter((x) => x.id !== c.id))
    await supabase.from('project_corrections').delete().eq('id', c.id)
  }

  async function addItem(correctionId: string) {
    const atuais = itens[correctionId] || []
    const proximo = atuais.length > 0 ? Math.max(...atuais.map((i) => i.numero)) + 1 : 1
    const { data, error } = await supabase
      .from('project_correction_items')
      .insert({ correction_id: correctionId, numero: proximo, exigencia: '', ordem: atuais.length })
      .select()
      .single()
    if (error) {
      setErro(error.message)
      return
    }
    setItens((prev) => ({ ...prev, [correctionId]: [...atuais, data as ProjectCorrectionItem] }))
  }

  async function updateItem(correctionId: string, id: string, patch: Partial<ProjectCorrectionItem>) {
    setItens((prev) => ({
      ...prev,
      [correctionId]: (prev[correctionId] || []).map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }))
    const { error } = await supabase.from('project_correction_items').update(patch).eq('id', id)
    if (error) setErro(error.message)
  }

  async function removeItem(correctionId: string, id: string) {
    setItens((prev) => ({
      ...prev,
      [correctionId]: (prev[correctionId] || []).filter((i) => i.id !== id),
    }))
    await supabase.from('project_correction_items').delete().eq('id', id)
  }

  async function gerarOficio(c: ProjectCorrection) {
    setErro(null)
    setOficioId(c.id)
    setGerando(c.id)
    // Espera o React desenhar a cópia oculta antes de capturar.
    await new Promise((r) => setTimeout(r, 350))
    try {
      if (!oficioRef.current) throw new Error('Não foi possível montar o documento.')
      const nome = project.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      await exportElementToPdf(oficioRef.current, `oficio-resposta-${nome}-${c.numero}a-correcao.pdf`, {
        orientation: 'portrait',
        format: 'a4',
      })
      if (!c.respondida) {
        await updateCorrecao(c.id, { respondida: true, data_resposta: todayStr() })
      }
    } catch (err: any) {
      setErro(err.message || 'Erro ao gerar o ofício.')
    } finally {
      setGerando(null)
      setOficioId(null)
    }
  }

  if (loading) return <p className="text-xs text-slate-400">Carregando correções...</p>

  const correcaoDoOficio = corrections.find((c) => c.id === oficioId)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-slate-500">
          Registre aqui as exigências recebidas do Corpo de Bombeiros. Cada análise vira uma correção com seus
          itens; ao responder, gere o <b>ofício resposta</b> em PDF já com os dados do projeto.
        </p>
        <button
          onClick={addCorrecao}
          className="shrink-0 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-3 py-1.5 rounded-md"
        >
          + Adicionar correção
        </button>
      </div>

      {(!client.numero_processo?.trim() || !client.cnpj?.trim()) && (
        <p className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
          Para o ofício sair completo, preencha <b>CNPJ ou CPF</b> e <b>Número do processo</b> na aba
          "Dados do cliente".
        </p>
      )}

      {erro && <p className="text-xs text-red-600">{erro}</p>}

      {corrections.length === 0 && (
        <p className="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-300 rounded-lg">
          Nenhuma correção registrada. Clique em "Adicionar correção" quando receber exigências.
        </p>
      )}

      <div className="space-y-3">
        {corrections.map((c) => {
          const lista = itens[c.id] || []
          const respondidos = lista.filter((i) => i.resposta?.trim()).length
          const aberta = abertas.has(c.id)

          return (
            <div key={c.id} className="border border-slate-200 rounded-lg overflow-hidden">
              {/* Cabeçalho da correção */}
              <div className="bg-slate-50 border-b border-slate-200 px-3 py-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => toggleAberta(c.id)}
                    className="text-xs font-semibold text-slate-700 hover:text-indigo-700 flex items-center gap-1"
                  >
                    <span className="text-slate-400">{aberta ? '▾' : '▸'}</span>
                    {c.numero}ª correção
                  </button>

                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                      c.respondida
                        ? 'bg-green-100 text-green-700 border-green-300'
                        : 'bg-amber-100 text-amber-700 border-amber-300'
                    }`}
                  >
                    {c.respondida ? `Respondida em ${formatDateBR(c.data_resposta)}` : 'Em aberto'}
                  </span>

                  <span className="text-[10px] text-slate-400">
                    {respondidos}/{lista.length} item{lista.length !== 1 ? 's' : ''} respondido
                    {respondidos !== 1 ? 's' : ''}
                  </span>

                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => gerarOficio(c)}
                      disabled={gerando === c.id || lista.length === 0}
                      className="text-[11px] bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white font-medium px-2.5 py-1 rounded-md"
                      title={lista.length === 0 ? 'Adicione ao menos um item' : 'Gerar ofício resposta em PDF'}
                    >
                      {gerando === c.id ? 'Gerando...' : 'Gerar ofício (PDF)'}
                    </button>
                    <button
                      onClick={() => removeCorrecao(c)}
                      className="text-slate-300 hover:text-red-500 px-1"
                      title="Excluir correção"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <label className="flex items-center gap-1 text-[10px] text-slate-500">
                    Data da análise
                    <input
                      type="date"
                      className="border border-slate-300 rounded px-1.5 py-0.5 text-[11px]"
                      value={c.data}
                      onChange={(e) => updateCorrecao(c.id, { data: e.target.value })}
                    />
                  </label>
                  <label className="flex items-center gap-1 text-[10px] text-slate-500 flex-1 min-w-[180px]">
                    Analista
                    <input
                      className="border border-slate-300 rounded px-1.5 py-0.5 text-[11px] flex-1"
                      placeholder="Nome do analista do Corpo de Bombeiros"
                      value={c.analista || ''}
                      onChange={(e) =>
                        setCorrections((prev) =>
                          prev.map((x) => (x.id === c.id ? { ...x, analista: e.target.value } : x))
                        )
                      }
                      onBlur={(e) => updateCorrecao(c.id, { analista: e.target.value || null })}
                    />
                  </label>
                </div>
              </div>

              {/* Itens */}
              {aberta && (
                <div className="p-3 space-y-2">
                  {lista.map((item) => (
                    <div key={item.id} className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="bg-slate-50 px-2.5 py-1.5 flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-slate-700">
                          Item {String(item.numero).padStart(2, '0')}
                        </span>
                        {item.resposta?.trim() ? (
                          <span className="text-[10px] text-green-600 font-medium">✓ respondido</span>
                        ) : (
                          <span className="text-[10px] text-amber-600 font-medium">sem resposta</span>
                        )}
                        <button
                          onClick={() => removeItem(c.id, item.id)}
                          className="ml-auto text-slate-300 hover:text-red-500 px-1"
                          title="Excluir item"
                        >
                          ×
                        </button>
                      </div>
                      <div className="p-2 space-y-2">
                        <div>
                          <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                            Exigência do Corpo de Bombeiros
                          </label>
                          <textarea
                            className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px]"
                            rows={2}
                            placeholder="Transcreva a pendência apontada na análise..."
                            value={item.exigencia}
                            onChange={(e) =>
                              setItens((prev) => ({
                                ...prev,
                                [c.id]: (prev[c.id] || []).map((i) =>
                                  i.id === item.id ? { ...i, exigencia: e.target.value } : i
                                ),
                              }))
                            }
                            onBlur={(e) => updateItem(c.id, item.id, { exigencia: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                            Resposta <span className="text-slate-400 font-normal">(sai no ofício)</span>
                          </label>
                          <textarea
                            className={`w-full border rounded-md px-2 py-1 text-[11px] ${
                              item.resposta?.trim() ? 'border-slate-300' : 'border-amber-300 bg-amber-50/30'
                            }`}
                            rows={3}
                            placeholder="Descreva o esclarecimento ou a providência adotada..."
                            value={item.resposta || ''}
                            onChange={(e) =>
                              setItens((prev) => ({
                                ...prev,
                                [c.id]: (prev[c.id] || []).map((i) =>
                                  i.id === item.id ? { ...i, resposta: e.target.value } : i
                                ),
                              }))
                            }
                            onBlur={(e) => updateItem(c.id, item.id, { resposta: e.target.value || null })}
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={() => addItem(c.id)}
                    className="w-full border border-dashed border-slate-300 rounded-lg py-1.5 text-[11px] text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-slate-50 transition"
                  >
                    + Adicionar item {String((lista.length || 0) + 1).padStart(2, '0')}
                  </button>

                  {/* Cabeçalho do ofício: editável, herdado da correção anterior */}
                  <div className="border border-slate-200 rounded-lg p-2.5 bg-slate-50/60 space-y-2">
                    <p className="text-[10px] font-medium text-slate-500">Cabeçalho do ofício</p>
                    <div className="flex flex-wrap items-start gap-3">
                      <label className="flex flex-col gap-0.5 text-[10px] text-slate-500">
                        Cidade
                        <input
                          className="border border-slate-300 rounded px-1.5 py-1 text-[11px] w-40"
                          placeholder={OFICIO_CIDADE_PADRAO}
                          value={c.cidade ?? ''}
                          onChange={(e) =>
                            setCorrections((prev) =>
                              prev.map((x) => (x.id === c.id ? { ...x, cidade: e.target.value } : x))
                            )
                          }
                          onBlur={(e) => updateCorrecao(c.id, { cidade: e.target.value || null })}
                        />
                      </label>
                      <label className="flex flex-col gap-0.5 text-[10px] text-slate-500 flex-1 min-w-[220px]">
                        Destinatário <span className="text-slate-400">(uma linha por linha do endereçamento)</span>
                        <textarea
                          className="border border-slate-300 rounded px-1.5 py-1 text-[11px]"
                          rows={2}
                          placeholder={OFICIO_DESTINATARIO_PADRAO}
                          value={c.destinatario ?? ''}
                          onChange={(e) =>
                            setCorrections((prev) =>
                              prev.map((x) => (x.id === c.id ? { ...x, destinatario: e.target.value } : x))
                            )
                          }
                          onBlur={(e) => updateCorrecao(c.id, { destinatario: e.target.value || null })}
                        />
                      </label>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      A próxima correção deste projeto já vem com esses mesmos dados.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                      Considerações finais <span className="text-slate-400 font-normal">(opcional)</span>
                    </label>
                    <textarea
                      className="w-full border border-slate-300 rounded-md px-2 py-1 text-[11px]"
                      rows={2}
                      placeholder="Texto adicional que aparece ao final do ofício..."
                      value={c.observacoes || ''}
                      onChange={(e) =>
                        setCorrections((prev) =>
                          prev.map((x) => (x.id === c.id ? { ...x, observacoes: e.target.value } : x))
                        )
                      }
                      onBlur={(e) => updateCorrecao(c.id, { observacoes: e.target.value || null })}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Cópia oculta em tamanho real, usada apenas para a captura do PDF */}
      {correcaoDoOficio && (
        <div style={{ position: 'fixed', top: 0, left: -99999, pointerEvents: 'none' }}>
          <OficioView
            ref={oficioRef}
            project={project}
            client={client}
            correction={correcaoDoOficio}
            items={itens[correcaoDoOficio.id] || []}
          />
        </div>
      )}
    </div>
  )
}
