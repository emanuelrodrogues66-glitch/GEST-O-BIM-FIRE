import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ProjectFile } from '../types'
import { FILE_CATEGORIES } from '../types'
import {
  driveConectado,
  driveConfigError,
  desconectarDrive,
  encontrarOuCriarPasta,
  enviarArquivo,
  obterToken,
} from '../lib/googleDrive'

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

function fileIcon(nome: string): string {
  const ext = nome.split('.').pop()?.toLowerCase() || ''
  if (ext === 'pdf') return '📄'
  if (['dwg', 'dxf'].includes(ext)) return '📐'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return '🖼️'
  if (['doc', 'docx'].includes(ext)) return '📝'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊'
  if (['zip', 'rar', '7z'].includes(ext)) return '🗜️'
  return '📎'
}

type Uploading = { nome: string; progresso: number; erro?: string; categoria: string }

export default function FileUpload({
  projectId,
  folderName,
  dispensaUpload,
}: {
  projectId: string
  folderName?: string | null
  /** Memorial simplificado / TAC: some a exigência dos anexos. */
  dispensaUpload?: boolean | null
}) {
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploads, setUploads] = useState<Uploading[]>([])
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [conectado, setConectado] = useState(driveConectado())
  const [conectando, setConectando] = useState(false)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const configErro = driveConfigError()

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('project_files')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    setFiles((data as ProjectFile[]) || [])
    setLoading(false)
  }

  async function conectar() {
    setErroGeral(null)
    setConectando(true)
    try {
      await obterToken(true)
      setConectado(true)
    } catch (err: any) {
      setErroGeral(err.message || 'Não foi possível conectar ao Google Drive.')
    } finally {
      setConectando(false)
    }
  }

  async function handleFiles(list: FileList | null, categoria: string, categoriaLabel: string) {
    if (!list || list.length === 0) return
    setErroGeral(null)

    let token: string
    try {
      token = await obterToken(true)
      setConectado(true)
    } catch (err: any) {
      setErroGeral(err.message || 'Conecte sua conta Google para anexar arquivos.')
      return
    }

    // Organiza no Drive espelhando a estrutura do app:
    // Pasta raiz / Nome da pasta do projeto / Tipo de documento
    let destino: string
    try {
      const pastaProjeto = await encontrarOuCriarPasta(token, folderName || '')
      destino = await encontrarOuCriarPasta(token, categoriaLabel, pastaProjeto)
    } catch (err: any) {
      setErroGeral(err.message)
      return
    }

    const arr = Array.from(list)
    const base = uploads.length
    setUploads((prev) => [...prev, ...arr.map((f) => ({ nome: f.name, progresso: 0, categoria }))])

    for (let i = 0; i < arr.length; i++) {
      const idx = base + i
      try {
        const enviado = await enviarArquivo(token, destino, arr[i], (pct) =>
          setUploads((prev) => prev.map((u, k) => (k === idx ? { ...u, progresso: pct } : u)))
        )

        const { data, error } = await supabase
          .from('project_files')
          .insert({
            project_id: projectId,
            categoria,
            nome: enviado.name || arr[i].name,
            drive_file_id: enviado.id,
            drive_link: enviado.webViewLink || `https://drive.google.com/file/d/${enviado.id}/view`,
            mime_type: enviado.mimeType || arr[i].type || null,
            tamanho: Number(enviado.size) || arr[i].size,
          })
          .select()
          .single()
        if (error) throw error

        setFiles((prev) => [data as ProjectFile, ...prev])
        setUploads((prev) => prev.map((u, k) => (k === idx ? { ...u, progresso: 100 } : u)))
      } catch (err: any) {
        setUploads((prev) =>
          prev.map((u, k) => (k === idx ? { ...u, erro: err.message || 'Erro no envio' } : u))
        )
      }
    }

    setTimeout(() => setUploads((prev) => prev.filter((u) => u.erro)), 1500)
    if (inputRefs.current[categoria]) inputRefs.current[categoria]!.value = ''
  }

  async function handleRemove(f: ProjectFile) {
    if (!confirm(`Remover "${f.nome}" da lista do projeto?\n\nO arquivo continua salvo no Google Drive.`))
      return
    setFiles((prev) => prev.filter((x) => x.id !== f.id))
    const { error } = await supabase.from('project_files').delete().eq('id', f.id)
    if (error) {
      setErroGeral(error.message)
      load()
    }
  }

  if (configErro) {
    return (
      <div className="border-t border-slate-100 pt-4">
        <label className="block text-xs font-medium text-slate-500 mb-2">Arquivos do projeto</label>
        <p className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
          Integração com o Google Drive ainda não configurada. {configErro}
        </p>
      </div>
    )
  }

  return (
    <div className="border-t border-slate-100 pt-4">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <label className="block text-xs font-medium text-slate-500">Arquivos do projeto</label>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400">
            {folderName?.trim()
              ? `Drive · pasta "${folderName.trim()}"`
              : 'Preencha "Nome da pasta" para separar por projeto'}
          </span>
          {conectado && (
            <button
              onClick={() => {
                desconectarDrive()
                setConectado(false)
              }}
              className="text-[10px] text-slate-400 hover:text-slate-700 underline"
              title="Encerrar o acesso ao seu Drive nesta sessão"
            >
              desconectar
            </button>
          )}
        </div>
      </div>

      {!conectado && (
        <button
          onClick={conectar}
          disabled={conectando}
          className="w-full mb-3 border border-slate-300 hover:border-indigo-400 hover:bg-slate-50 disabled:opacity-50 rounded-lg py-2 text-xs font-medium text-slate-700 flex items-center justify-center gap-2 transition"
        >
          <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#4285F4" d="M45 24c0-1.6-.1-2.7-.4-3.9H24v7.1h12c-.2 1.9-1.5 4.7-4.4 6.6l6.7 5.2c4-3.7 6.7-9.1 6.7-15z" />
            <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.3c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-7.1 5.5C8.1 41.1 15.4 46 24 46z" />
            <path fill="#FBBC05" d="M11.5 28.5c-.5-1.4-.7-2.9-.7-4.5s.3-3.1.7-4.5l-7.1-5.5C2.9 17 2 20.4 2 24s.9 7 2.4 10z" />
            <path fill="#EA4335" d="M24 10.2c3.2 0 6 1.1 8.2 3.2l6.1-6.1C34.9 3.9 29.9 2 24 2 15.4 2 8.1 6.9 4.4 14l7.1 5.5c1.8-5.3 6.7-9.3 12.5-9.3z" />
          </svg>
          {conectando ? 'Abrindo o Google...' : 'Conectar Google Drive'}
        </button>
      )}

      {erroGeral && <p className="text-xs text-red-600 mb-2">{erroGeral}</p>}

      <div className="space-y-3">
        {FILE_CATEGORIES.map((cat) => {
          const doTipo = files.filter((f) => (f.categoria || 'outros') === cat.key)
          const enviando = uploads.filter((u) => u.categoria === cat.key)

          return (
            <div key={cat.key} className="border border-slate-200 rounded-lg p-2.5">
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5 flex-wrap">
                    {cat.label}
                    {cat.obrigatorio &&
                      (dispensaUpload ? (
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-300">
                          dispensado
                        </span>
                      ) : doTipo.length > 0 ? (
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-300">
                          obrigatório ✓
                        </span>
                      ) : (
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300">
                          obrigatório
                        </span>
                      ))}
                  </p>
                  <p className="text-[10px] text-slate-400">{cat.hint}</p>
                </div>
                <span className="text-[10px] text-slate-400 shrink-0">
                  {doTipo.length} arquivo{doTipo.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(cat.key)
                }}
                onDragLeave={() => setDragOver((v) => (v === cat.key ? null : v))}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(null)
                  handleFiles(e.dataTransfer.files, cat.key, cat.label)
                }}
                onClick={() => inputRefs.current[cat.key]?.click()}
                className={`border border-dashed rounded-md py-2 text-center cursor-pointer transition ${
                  dragOver === cat.key
                    ? 'border-indigo-400 bg-indigo-50'
                    : 'border-slate-300 hover:border-indigo-300 hover:bg-slate-50'
                }`}
              >
                <p className="text-[11px] text-slate-500">
                  {dragOver === cat.key ? 'Solte aqui' : 'Arraste ou clique para adicionar arquivo'}
                </p>
                <input
                  ref={(el) => {
                    inputRefs.current[cat.key] = el
                  }}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files, cat.key, cat.label)}
                />
              </div>

              {enviando.length > 0 && (
                <div className="space-y-1 mt-2">
                  {enviando.map((u, i) => (
                    <div key={i} className="text-[11px]">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-slate-600 truncate max-w-[70%]">{u.nome}</span>
                        <span className={u.erro ? 'text-red-600' : 'text-slate-400'}>
                          {u.erro ? 'Falhou' : `${u.progresso}%`}
                        </span>
                      </div>
                      {u.erro ? (
                        <p className="text-[10px] text-red-600">{u.erro}</p>
                      ) : (
                        <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 transition-all"
                            style={{ width: `${u.progresso}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {loading ? (
                <p className="text-[10px] text-slate-400 mt-2">Carregando...</p>
              ) : (
                doTipo.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {doTipo.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center gap-2 border border-slate-200 rounded-md px-2 py-1 text-[11px] hover:border-indigo-300 transition"
                      >
                        <span className="shrink-0">{fileIcon(f.nome)}</span>
                        <a
                          href={f.drive_link || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 min-w-0 truncate text-slate-700 hover:text-indigo-700 hover:underline"
                          title={f.nome}
                        >
                          {f.nome}
                        </a>
                        <span className="text-slate-400 shrink-0">{formatSize(f.tamanho)}</span>
                        <span className="text-slate-300 shrink-0">{formatDate(f.created_at)}</span>
                        <button
                          onClick={() => handleRemove(f)}
                          className="text-slate-300 hover:text-red-500 shrink-0 px-1"
                          title="Remover da lista"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
