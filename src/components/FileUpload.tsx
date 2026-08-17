import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ProjectFile } from '../types'

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR')
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

type Uploading = {
  nome: string
  progresso: number
  erro?: string
}

export default function FileUpload({
  projectId,
  folderName,
}: {
  projectId: string
  folderName?: string | null
}) {
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploads, setUploads] = useState<Uploading[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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

  /** Envia um arquivo: pede autorização ao servidor e manda os bytes direto ao Google. */
  async function uploadOne(file: File, index: number) {
    const setProgresso = (progresso: number, erro?: string) => {
      setUploads((prev) => prev.map((u, i) => (i === index ? { ...u, progresso, erro } : u)))
    }

    // 1. Pede ao servidor uma URL de upload autorizada.
    const authRes = await fetch('/api/drive-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        folderName: folderName || null,
      }),
    })

    const auth = await authRes.json()
    if (!authRes.ok) throw new Error(auth.error || 'Não foi possível autorizar o upload.')

    // 2. Envia os bytes direto ao Google, acompanhando o progresso.
    const uploaded = await new Promise<any>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', auth.uploadUrl, true)
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgresso(Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText))
          } catch {
            reject(new Error('Resposta inesperada do Google Drive.'))
          }
        } else {
          reject(new Error(`O Google recusou o envio (${xhr.status}).`))
        }
      }
      xhr.onerror = () => reject(new Error('Falha de rede durante o envio.'))
      xhr.send(file)
    })

    // 3. Registra o arquivo no banco para aparecer na lista.
    const registro = {
      project_id: projectId,
      nome: uploaded.name || file.name,
      drive_file_id: uploaded.id,
      drive_link: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
      mime_type: uploaded.mimeType || file.type || null,
      tamanho: Number(uploaded.size) || file.size,
    }

    const { data, error } = await supabase.from('project_files').insert(registro).select().single()
    if (error) throw error

    setFiles((prev) => [data as ProjectFile, ...prev])
    setProgresso(100)
  }

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    setErroGeral(null)

    const arr = Array.from(list)
    const base = uploads.length
    setUploads((prev) => [...prev, ...arr.map((f) => ({ nome: f.name, progresso: 0 }))])

    for (let i = 0; i < arr.length; i++) {
      try {
        await uploadOne(arr[i], base + i)
      } catch (err: any) {
        setUploads((prev) =>
          prev.map((u, idx) => (idx === base + i ? { ...u, erro: err.message || 'Erro no envio' } : u))
        )
      }
    }

    // Limpa da lista de progresso os que terminaram sem erro.
    setTimeout(() => {
      setUploads((prev) => prev.filter((u) => u.erro))
    }, 1500)

    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleRemove(f: ProjectFile) {
    if (!confirm(`Remover "${f.nome}" da lista do projeto?\n\nO arquivo continua salvo no Google Drive.`)) return
    setFiles((prev) => prev.filter((x) => x.id !== f.id))
    const { error } = await supabase.from('project_files').delete().eq('id', f.id)
    if (error) {
      setErroGeral(error.message)
      load()
    }
  }

  return (
    <div className="border-t border-slate-100 pt-4">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs font-medium text-slate-500">Arquivos do projeto</label>
        <span className="text-[10px] text-slate-400">
          {folderName?.trim()
            ? `Salvando no Drive · pasta "${folderName.trim()}"`
            : 'Preencha "Nome da pasta" para organizar por projeto no Drive'}
        </span>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition ${
          dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 hover:border-indigo-300 hover:bg-slate-50'
        }`}
      >
        <p className="text-xs text-slate-600 font-medium">
          Arraste arquivos aqui ou clique para escolher
        </p>
        <p className="text-[10px] text-slate-400 mt-0.5">
          Plantas, PDFs, DWG, protocolos — sem limite de tamanho
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {erroGeral && <p className="text-xs text-red-600 mt-2">{erroGeral}</p>}

      {uploads.length > 0 && (
        <div className="space-y-1.5 mt-3">
          {uploads.map((u, i) => (
            <div key={i} className="text-xs">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-slate-600 truncate max-w-[70%]">{u.nome}</span>
                <span className={u.erro ? 'text-red-600' : 'text-slate-400'}>
                  {u.erro ? 'Falhou' : `${u.progresso}%`}
                </span>
              </div>
              {u.erro ? (
                <p className="text-[10px] text-red-600">{u.erro}</p>
              ) : (
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
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
        <p className="text-xs text-slate-400 mt-3">Carregando arquivos...</p>
      ) : files.length === 0 ? (
        <p className="text-xs text-slate-400 mt-3 py-1">Nenhum arquivo anexado ainda.</p>
      ) : (
        <div className="space-y-1.5 mt-3 max-h-56 overflow-y-auto pr-1">
          {files.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs hover:border-indigo-300 transition"
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
      )}
    </div>
  )
}
