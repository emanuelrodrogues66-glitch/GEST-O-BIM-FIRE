import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ProjectActivity } from '../types'
import { driveConfigError, encontrarOuCriarPasta, enviarArquivo, obterToken } from '../lib/googleDrive'
import { DURACOES, JORNADA_PADRAO, horasLegiveis } from '../types'
import type { ProjectTask } from '../types'

/** Print anexado ao registro, ainda só na memória do navegador. */
type ImagemColada = { file: File; previa: string }

/** Imagem já salva no Drive e ligada a uma atividade. */
type AnexoDaAtividade = {
  id: string
  activity_id: string
  nome: string
  drive_link: string | null
  drive_file_id: string | null
  mime_type: string | null
}

/**
 * Miniatura servida pelo próprio Drive.
 * Funciona porque o usuário já está logado no Google no navegador; se o
 * Google recusar, a imagem cai para um link, sem quebrar o histórico.
 */
function urlMiniatura(driveFileId: string, largura = 320): string {
  return `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w${largura}`
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export default function ActivityHistory({
  projectId,
  responsaveis,
  responsavelDoProjeto,
}: {
  projectId: string
  responsaveis: string[]
  /** Projetista dos Dados gerais: entra pré-selecionado ao assumir. */
  responsavelDoProjeto?: string | null
}) {
  const [activities, setActivities] = useState<ProjectActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    responsavel: '',
    data: todayStr(),
    descricao: '',
    horas: String(JORNADA_PADRAO),
  })

  /**
   * Tarefas abertas do projeto, para vincular o tempo do dia.
   * O vínculo apenas REPARTE as horas informadas acima — nunca as substitui.
   * Se substituísse, a hora gasta no projeto fora de qualquer tarefa sumiria
   * da conta e o projeto pareceria mais barato do que foi.
   */
  const [tarefasDoProjeto, setTarefasDoProjeto] = useState<ProjectTask[]>([])
  const [tarefasMarcadas, setTarefasMarcadas] = useState<string[]>([])

  /** Responsável do projeto primeiro; depois os demais nomes conhecidos. */
  const opcoesResponsavel = useMemo(() => {
    const lista = responsavelDoProjeto ? [responsavelDoProjeto] : []
    for (const r of responsaveis) {
      if (!lista.some((x) => x.toLowerCase() === r.toLowerCase())) lista.push(r)
    }
    return lista
  }, [responsaveis, responsavelDoProjeto])

  // Prints colados com Ctrl+V, enviados ao Drive junto com o registro.
  const [imagens, setImagens] = useState<ImagemColada[]>([])
  const [anexos, setAnexos] = useState<AnexoDaAtividade[]>([])
  const [enviando, setEnviando] = useState('')

  // Imagem aberta em tamanho grande.
  const [ampliada, setAmpliada] = useState<AnexoDaAtividade | null>(null)

  // Edição de um registro já gravado do histórico.
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState({ responsavel: '', data: '', descricao: '' })

  useEffect(() => {
    load()
    prefillResponsavel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, responsavelDoProjeto])

  /**
   * O login é compartilhado, então o usuário da sessão não diz quem está
   * trabalhando. O responsável cadastrado no projeto é o palpite certo,
   * e a lista ao lado permite trocar quando outra pessoa assumir.
   */
  async function prefillResponsavel() {
    if (responsavelDoProjeto) {
      setForm((f) => ({ ...f, responsavel: responsavelDoProjeto }))
      return
    }
    const { data } = await supabase.auth.getSession()
    const meta = data.session?.user.user_metadata as any
    const nome = meta?.nome || data.session?.user.email?.split('@')[0] || ''
    setForm((f) => ({ ...f, responsavel: nome }))
  }

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('project_activities')
      .select('*')
      .eq('project_id', projectId)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
    setActivities((data as ProjectActivity[]) || [])

    const { data: arquivos } = await supabase
      .from('project_files')
      .select('id, activity_id, nome, drive_link, drive_file_id, mime_type')
      .eq('project_id', projectId)
      .not('activity_id', 'is', null)
    setAnexos((arquivos as AnexoDaAtividade[]) || [])

    const { data: tarefas } = await supabase
      .from('project_tasks')
      .select('*')
      .eq('project_id', projectId)
      .neq('status', 'Concluído')
      .order('data_prazo')
    setTarefasDoProjeto((tarefas as ProjectTask[]) || [])

    setLoading(false)
  }

  /**
   * Ctrl+V com um print na área de transferência.
   * O navegador entrega a imagem como arquivo; guardamos até o registro ser
   * salvo, porque o anexo precisa do id da atividade para se amarrar a ela.
   */
  function colar(e: React.ClipboardEvent) {
    const itens = Array.from(e.clipboardData?.items || [])
    const novas: ImagemColada[] = []
    for (const item of itens) {
      if (!item.type.startsWith('image/')) continue
      const arquivo = item.getAsFile()
      if (!arquivo) continue
      const ext = (item.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
      const carimbo = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      novas.push({
        file: new File([arquivo], `print-${carimbo}.${ext}`, { type: item.type }),
        previa: URL.createObjectURL(arquivo),
      })
    }
    if (novas.length) {
      e.preventDefault()
      setImagens((prev) => [...prev, ...novas])
    }
  }

  /** Sobe os prints para o Drive e liga cada um à atividade recém-criada. */
  async function enviarImagens(atividade: ProjectActivity) {
    if (imagens.length === 0) return

    const erroConfig = driveConfigError()
    if (erroConfig) {
      alert(`Atividade salva, mas a imagem não subiu: ${erroConfig}`)
      return
    }

    try {
      const token = await obterToken(true)
      const { data: cliente } = await supabase
        .from('project_clients')
        .select('nome_pasta')
        .eq('project_id', projectId)
        .maybeSingle()

      const pastaProjeto = await encontrarOuCriarPasta(
        token,
        (cliente as any)?.nome_pasta || 'Projeto sem pasta'
      )
      const destino = await encontrarOuCriarPasta(token, 'Atividades', pastaProjeto)

      for (let i = 0; i < imagens.length; i++) {
        setEnviando(`Enviando imagem ${i + 1} de ${imagens.length}...`)
        const enviado = await enviarArquivo(token, destino, imagens[i].file)
        const { data } = await supabase
          .from('project_files')
          .insert({
            project_id: projectId,
            activity_id: atividade.id,
            categoria: 'outros',
            nome: enviado.name || imagens[i].file.name,
            drive_file_id: enviado.id,
            drive_link: enviado.webViewLink || `https://drive.google.com/file/d/${enviado.id}/view`,
            mime_type: enviado.mimeType || imagens[i].file.type,
            tamanho: Number(enviado.size) || imagens[i].file.size,
          })
          .select('id, activity_id, nome, drive_link, drive_file_id, mime_type')
          .single()
        if (data) setAnexos((prev) => [...prev, data as AnexoDaAtividade])
      }
    } catch (err: any) {
      alert(`Atividade salva, mas a imagem não subiu: ${err.message}`)
    } finally {
      setEnviando('')
    }
  }

  async function handleAssumir() {
    if (!form.responsavel.trim()) return
    setSaving(true)
    try {
      const horas = Number(form.horas)
      const payload = {
        project_id: projectId,
        responsavel: form.responsavel.trim(),
        data: form.data,
        descricao: form.descricao.trim() || null,
        horas: horas > 0 ? horas : null,
        horas_estimadas: false,
      }
      const { data, error } = await supabase.from('project_activities').insert(payload).select().single()
      if (error) throw error

      // Reparte as horas do dia entre as tarefas marcadas, em partes iguais.
      if (tarefasMarcadas.length > 0 && horas > 0) {
        const fatia = Number((horas / tarefasMarcadas.length).toFixed(2))
        await supabase.from('activity_task_hours').insert(
          tarefasMarcadas.map((taskId) => ({
            activity_id: (data as ProjectActivity).id,
            task_id: taskId,
            horas: fatia,
          }))
        )
      }

      await enviarImagens(data as ProjectActivity)

      setActivities((prev) => [data as ProjectActivity, ...prev])
      setForm((f) => ({ ...f, descricao: '', horas: String(JORNADA_PADRAO) }))
      setTarefasMarcadas([])
      imagens.forEach((i) => URL.revokeObjectURL(i.previa))
      setImagens([])
      setShowForm(false)
    } catch (err: any) {
      alert(err.message || 'Erro ao registrar atividade')
    } finally {
      setSaving(false)
    }
  }

  /** Salva a edição de um registro já existente do histórico. */
  async function salvarEdicao(id: string, patch: Partial<ProjectActivity>) {
    setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
    const { error } = await supabase.from('project_activities').update(patch).eq('id', id)
    if (error) {
      alert(error.message)
      load()
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este registro do histórico?')) return
    setActivities((prev) => prev.filter((a) => a.id !== id))
    await supabase.from('project_activities').delete().eq('id', id)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs font-medium text-slate-500">Histórico de atividades do projeto</label>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-3 py-1 rounded-md"
          >
            + Assumir projeto no dia
          </button>
        )}
      </div>

      {showForm && (
        <div className="border border-indigo-200 bg-indigo-50/40 rounded-lg p-3 mb-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="flex-1 min-w-[140px] border border-slate-300 rounded-md px-2 py-1 text-xs bg-white"
              value={opcoesResponsavel.includes(form.responsavel) ? form.responsavel : '__outro'}
              onChange={(e) => {
                const v = e.target.value
                setForm((f) => ({ ...f, responsavel: v === '__outro' ? '' : v }))
              }}
            >
              <option value="" disabled>
                Quem assumiu?
              </option>
              {opcoesResponsavel.map((r) => (
                <option key={r} value={r}>
                  {r}
                  {r === responsavelDoProjeto ? ' (responsável do projeto)' : ''}
                </option>
              ))}
              <option value="__outro">Outro...</option>
            </select>

            {!opcoesResponsavel.includes(form.responsavel) && (
              <input
                className="flex-1 min-w-[120px] border border-slate-300 rounded-md px-2 py-1 text-xs"
                placeholder="Nome de quem assumiu"
                value={form.responsavel}
                onChange={(e) => setForm((f) => ({ ...f, responsavel: e.target.value }))}
                autoFocus
              />
            )}
            <input
              type="date"
              className="border border-slate-300 rounded-md px-2 py-1 text-xs"
              value={form.data}
              onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
            />
          </div>
          <textarea
            className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs"
            rows={2}
            placeholder="O que foi feito no projeto neste dia? (Ctrl+V cola um print aqui)"
            value={form.descricao}
            onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
            onPaste={colar}
          />

          {/* ---------- Quanto tempo o dia rendeu ---------- */}
          <div className="border border-slate-200 rounded-lg p-2.5 space-y-2 bg-slate-50/60">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-medium text-slate-500">Quanto tempo levou?</span>
              {DURACOES.map((d) => (
                <button
                  key={d.horas}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, horas: String(d.horas) }))}
                  className={`text-[11px] px-2 py-1 rounded-md border transition ${
                    Number(form.horas) === d.horas
                      ? 'bg-indigo-600 text-white border-indigo-600 font-medium'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                  }`}
                >
                  {d.rotulo}
                </button>
              ))}
              <input
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                value={form.horas}
                onChange={(e) => setForm((f) => ({ ...f, horas: e.target.value }))}
                className="w-20 border border-slate-300 rounded-md px-2 py-1 text-xs text-right"
                title="Horas dedicadas a este projeto neste dia"
              />
              <span className="text-[10px] text-slate-400">horas</span>
            </div>

            {/* Vínculo com tarefas: reparte a hora acima, não soma por cima. */}
            {tarefasDoProjeto.length > 0 && (
              <div className="border-t border-slate-200 pt-2 space-y-1.5">
                <p className="text-[10px] text-slate-500">
                  Esse tempo foi em alguma tarefa do projeto? Marque quantas quiser — as{' '}
                  <b>{horasLegiveis(Number(form.horas) || 0)}</b> são divididas entre elas.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {tarefasDoProjeto.map((t) => {
                    const marcada = tarefasMarcadas.includes(t.id)
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() =>
                          setTarefasMarcadas((prev) =>
                            marcada ? prev.filter((x) => x !== t.id) : [...prev, t.id]
                          )
                        }
                        className={`text-[10px] px-2 py-1 rounded-md border max-w-[220px] truncate transition ${
                          marcada
                            ? 'bg-emerald-600 text-white border-emerald-600 font-medium'
                            : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                        }`}
                      >
                        {t.codigo ? `${t.codigo} · ` : ''}
                        {t.nome}
                      </button>
                    )
                  })}
                </div>
                {tarefasMarcadas.length > 0 && (
                  <p className="text-[10px] text-emerald-700">
                    {horasLegiveis(Number(form.horas) / tarefasMarcadas.length)} em cada uma das{' '}
                    {tarefasMarcadas.length} tarefas marcadas.
                  </p>
                )}
                {tarefasMarcadas.length === 0 && (
                  <p className="text-[10px] text-slate-400">
                    Sem marcar nenhuma, o tempo fica no projeto de forma geral — e conta igual no
                    custo.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Prints colados, ainda no navegador: sobem ao salvar o registro */}
          {imagens.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {imagens.map((img, i) => (
                <div key={img.previa} className="relative">
                  <img
                    src={img.previa}
                    alt={img.file.name}
                    className="h-20 w-28 object-cover rounded-md border border-slate-300"
                  />
                  <button
                    onClick={() => {
                      URL.revokeObjectURL(img.previa)
                      setImagens((prev) => prev.filter((_, k) => k !== i))
                    }}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-slate-300 text-slate-500 hover:text-red-600 text-xs leading-none shadow-sm"
                    title="Tirar esta imagem"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-slate-400">
            Cole um print com <b>Ctrl+V</b> na caixa acima. Ele vai para a pasta do projeto no
            Drive, em "Atividades", quando você registrar.
          </p>

          {enviando && <p className="text-[10px] text-indigo-600">{enviando}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded-md"
            >
              Cancelar
            </button>
            <button
              onClick={handleAssumir}
              disabled={saving || !form.responsavel.trim()}
              className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md font-medium"
            >
              {saving ? (imagens.length ? 'Enviando...' : 'Salvando...') : 'Registrar'}
            </button>
          </div>
          <datalist id="activity-resp-suggestions">
            {responsaveis.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>
      )}

      {ampliada && ampliada.drive_file_id && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-6"
          onClick={() => setAmpliada(null)}
        >
          <div className="max-w-5xl max-h-full flex flex-col items-center gap-2">
            <img
              src={urlMiniatura(ampliada.drive_file_id, 1600)}
              alt={ampliada.nome}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl bg-white"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="flex items-center gap-3 text-xs text-white">
              <span className="opacity-80">{ampliada.nome}</span>
              <a
                href={ampliada.drive_link || '#'}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="underline hover:text-indigo-200"
              >
                Abrir no Drive
              </a>
              <button onClick={() => setAmpliada(null)} className="underline hover:text-indigo-200">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-400">Carregando histórico...</p>
      ) : activities.length === 0 ? (
        <p className="text-xs text-slate-400 py-2">Nenhuma atividade registrada ainda.</p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {activities.map((a) =>
            editandoId === a.id ? (
              <div key={a.id} className="border border-indigo-300 bg-indigo-50/40 rounded-lg p-2 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="flex-1 min-w-[140px] border border-slate-300 rounded-md px-2 py-1 text-xs"
                    list="activity-resp-suggestions"
                    value={rascunho.responsavel}
                    onChange={(e) => setRascunho((r) => ({ ...r, responsavel: e.target.value }))}
                  />
                  <input
                    type="date"
                    className="border border-slate-300 rounded-md px-2 py-1 text-xs"
                    value={rascunho.data}
                    onChange={(e) => setRascunho((r) => ({ ...r, data: e.target.value }))}
                  />
                </div>
                <textarea
                  className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs"
                  rows={2}
                  placeholder="O que foi feito no projeto neste dia?"
                  value={rascunho.descricao}
                  onChange={(e) => setRascunho((r) => ({ ...r, descricao: e.target.value }))}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditandoId(null)}
                    className="px-3 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded-md"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      await salvarEdicao(a.id, {
                        responsavel: rascunho.responsavel.trim() || a.responsavel,
                        data: rascunho.data || a.data,
                        descricao: rascunho.descricao.trim() || null,
                      })
                      setEditandoId(null)
                    }}
                    className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={a.id}
                className="flex items-start gap-2 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
              >
                <span className="text-slate-400 shrink-0 w-16">{formatDate(a.data)}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-slate-700">{a.responsavel}</span>
                  {a.descricao ? (
                    <p className="text-slate-500 mt-0.5 whitespace-pre-wrap">{a.descricao}</p>
                  ) : (
                    <p className="text-slate-300 mt-0.5 italic">Sem descrição</p>
                  )}

                  {anexos.filter((x) => x.activity_id === a.id).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {anexos
                        .filter((x) => x.activity_id === a.id)
                        .map((x) => (
                          <Miniatura key={x.id} anexo={x} onAmpliar={() => setAmpliada(x)} />
                        ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setEditandoId(a.id)
                    setRascunho({
                      responsavel: a.responsavel,
                      data: a.data,
                      descricao: a.descricao || '',
                    })
                  }}
                  className="text-slate-300 hover:text-indigo-600 shrink-0 px-1"
                  title="Editar"
                >
                  ✎
                </button>
                <button
                  onClick={() => handleDelete(a.id)}
                  className="text-slate-300 hover:text-red-500 shrink-0 px-1"
                  title="Excluir"
                >
                  ×
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}


/**
 * Miniatura de um anexo do Drive.
 *
 * O Google às vezes recusa servir a miniatura (arquivo privado, sessão sem
 * cookie do Drive). Quando isso acontece, cai para um link em vez de deixar
 * um quadrado quebrado na tela.
 */
function Miniatura({
  anexo,
  onAmpliar,
}: {
  anexo: AnexoDaAtividade
  onAmpliar: () => void
}) {
  const [falhou, setFalhou] = useState(false)
  const ehImagem = (anexo.mime_type || '').startsWith('image/')

  if (!anexo.drive_file_id || !ehImagem || falhou) {
    return (
      <a
        href={anexo.drive_link || '#'}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-[10px] text-indigo-600 hover:underline border border-indigo-200 bg-indigo-50 rounded px-1.5 py-0.5"
        title="Abrir no Google Drive"
      >
        🖼 {anexo.nome}
      </a>
    )
  }

  return (
    <button
      onClick={onAmpliar}
      className="group relative rounded-md overflow-hidden border border-slate-200 hover:border-indigo-400 transition"
      title={`${anexo.nome} — clique para ampliar`}
    >
      <img
        src={urlMiniatura(anexo.drive_file_id)}
        alt={anexo.nome}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFalhou(true)}
        className="h-24 w-32 object-cover bg-slate-50"
      />
      <span className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition" />
    </button>
  )
}
