import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { driveConfigError } from '../lib/googleDrive'
import type { AnexoDaTarefa } from '../lib/anexosTarefa'
import {
  PASTA_TAREFAS_GERAIS,
  ehImagem,
  imagensDaAreaDeTransferencia,
  subirAnexos,
  urlMiniatura,
} from '../lib/anexosTarefa'

/**
 * Observações e anexos de uma tarefa.
 *
 * Serve tanto para tarefa geral quanto para tarefa de projeto: o que muda é só
 * onde o arquivo cai no Drive. Aceita arquivo pelo botão e print pelo Ctrl+V.
 */
export default function TaskAttachments({
  taskId,
  projectId,
  observacoesIniciais,
}: {
  taskId: string
  projectId: string | null
  observacoesIniciais: string | null
}) {
  const [observacoes, setObservacoes] = useState(observacoesIniciais || '')
  const [salvandoObs, setSalvandoObs] = useState<'' | 'salvando' | 'salvo'>('')
  const [anexos, setAnexos] = useState<AnexoDaTarefa[]>([])
  const [enviando, setEnviando] = useState('')
  const [erro, setErro] = useState('')
  const [ampliada, setAmpliada] = useState<string | null>(null)
  const inputArquivo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  async function carregar() {
    const { data } = await supabase
      .from('project_files')
      .select('id, nome, drive_link, drive_file_id, mime_type')
      .eq('task_id', taskId)
      .order('created_at')
    setAnexos((data as AnexoDaTarefa[]) || [])
  }

  /** Grava a observação ao sair do campo — sem botão extra para esquecer. */
  async function salvarObservacoes() {
    if ((observacoesIniciais || '') === observacoes.trim() && salvandoObs === '') return
    setSalvandoObs('salvando')
    const { error } = await supabase
      .from('project_tasks')
      .update({ observacoes: observacoes.trim() || null })
      .eq('id', taskId)
    if (error) {
      setErro(error.message)
      setSalvandoObs('')
      return
    }
    setSalvandoObs('salvo')
    setTimeout(() => setSalvandoObs(''), 1500)
  }

  /** Ctrl+V com print na área de transferência: sobe direto, sem passo extra. */
  function colar(e: React.ClipboardEvent) {
    const arquivos = imagensDaAreaDeTransferencia(e)
    if (arquivos.length) {
      e.preventDefault()
      subir(arquivos)
    }
  }

  async function subir(arquivos: File[]) {
    if (arquivos.length === 0) return
    setErro('')

    const problema = driveConfigError()
    if (problema) {
      setErro(problema)
      return
    }

    try {
      const novos = await subirAnexos(taskId, projectId, arquivos, setEnviando)
      setAnexos((prev) => [...prev, ...novos])
    } catch (e: any) {
      setErro(e.message || 'Não foi possível enviar o arquivo.')
    } finally {
      setEnviando('')
    }
  }

  /**
   * Some da tarefa, mas continua no Drive.
   * Apagar o arquivo do Drive daqui seria destruir algo que talvez outra pessoa
   * também use — quem quiser remover de vez faz isso pelo próprio Drive.
   */
  async function remover(a: AnexoDaTarefa) {
    if (!confirm(`Tirar "${a.nome}" desta tarefa? O arquivo continua no Drive.`)) return
    const { error } = await supabase.from('project_files').delete().eq('id', a.id)
    if (error) {
      setErro(error.message)
      return
    }
    setAnexos((prev) => prev.filter((x) => x.id !== a.id))
  }

  return (
    <div className="space-y-2" onPaste={colar}>
      <div>
        <label className="block text-[10px] font-medium text-slate-500 mb-1">Observações</label>
        <textarea
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          onBlur={salvarObservacoes}
          rows={2}
          placeholder="O que foi combinado, onde parou, o que falta..."
          className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs resize-y"
        />
        {salvandoObs === 'salvando' && <span className="text-[10px] text-slate-400">Salvando...</span>}
        {salvandoObs === 'salvo' && <span className="text-[10px] text-emerald-600">Observação salva.</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputArquivo.current?.click()}
          disabled={!!enviando}
          className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-600 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50"
        >
          📎 Anexar arquivo
        </button>
        <input
          ref={inputArquivo}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            subir(Array.from(e.target.files || []))
            e.target.value = ''
          }}
        />
        <span className="text-[10px] text-slate-400">
          ou cole um print com Ctrl+V &middot; vai para{' '}
          {projectId ? 'a pasta do projeto no Drive' : `a pasta "${PASTA_TAREFAS_GERAIS}" no Drive`}
        </span>
        {enviando && <span className="text-[10px] text-indigo-600">{enviando}</span>}
      </div>

      {erro && <p className="text-[10px] text-red-600">{erro}</p>}

      {anexos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {anexos.map((a) => (
            <div key={a.id} className="relative group">
              {ehImagem(a.mime_type) && a.drive_file_id ? (
                <img
                  src={urlMiniatura(a.drive_file_id)}
                  alt={a.nome}
                  onClick={() => setAmpliada(urlMiniatura(a.drive_file_id!, 1600))}
                  className="w-20 h-20 object-cover rounded-md border border-slate-200 cursor-zoom-in"
                  onError={(e) => {
                    // Miniatura pode demorar a existir; o link nunca falha.
                    ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                  }}
                />
              ) : (
                <a
                  href={a.drive_link || '#'}
                  target="_blank"
                  rel="noreferrer"
                  title={a.nome}
                  className="w-20 h-20 flex flex-col items-center justify-center gap-1 rounded-md border border-slate-200 bg-slate-50 text-[9px] text-slate-500 px-1 text-center hover:border-indigo-300"
                >
                  <span className="text-lg">📄</span>
                  <span className="truncate w-full">{a.nome}</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => remover(a)}
                title="Tirar da tarefa"
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-slate-300 text-slate-400 text-[11px] leading-none opacity-0 group-hover:opacity-100 hover:text-red-600 hover:border-red-300"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {ampliada && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-6"
          onClick={() => setAmpliada(null)}
        >
          <img src={ampliada} alt="" className="max-w-full max-h-full rounded-lg shadow-lg" />
        </div>
      )}
    </div>
  )
}
