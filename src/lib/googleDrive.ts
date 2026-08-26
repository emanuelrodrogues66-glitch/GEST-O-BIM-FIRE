/**
 * Upload para o Google Drive usando a conta Google do próprio usuário.
 *
 * Por que assim: contas de serviço não possuem cota de armazenamento no Drive,
 * então elas não conseguem criar arquivos em pastas do "Meu Drive". Autenticando
 * como o usuário, os arquivos usam o espaço dele e ficam com a autoria correta.
 *
 * O envio vai direto do navegador para o Google (upload resumable), sem passar
 * pelo servidor — não há limite de tamanho de requisição e o progresso é real.
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const ROOT_FOLDER_ID = import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID as string | undefined
const SCOPE = 'https://www.googleapis.com/auth/drive'
const GIS_SRC = 'https://accounts.google.com/gsi/client'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

export type DriveFileResult = {
  id: string
  name: string
  webViewLink?: string
  size?: string
  mimeType?: string
}

export function driveConfigError(): string | null {
  if (!CLIENT_ID) return 'VITE_GOOGLE_CLIENT_ID não configurada no Vercel.'
  if (!ROOT_FOLDER_ID) return 'VITE_GOOGLE_DRIVE_FOLDER_ID não configurada no Vercel.'
  return null
}

/** Carrega o script do Google Identity Services uma única vez. */
let gisPromise: Promise<void> | null = null
function carregarGis(): Promise<void> {
  if (gisPromise) return gisPromise
  gisPromise = new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.oauth2) return resolve()
    const s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Não foi possível carregar o login do Google.'))
    document.head.appendChild(s)
  })
  return gisPromise
}

// Token em memória: some ao fechar a aba, o que é o desejável para credenciais.
let tokenAtual: string | null = null
let tokenExpiraEm = 0

export function driveConectado(): boolean {
  return !!tokenAtual && Date.now() < tokenExpiraEm
}

export function desconectarDrive() {
  const t = tokenAtual
  tokenAtual = null
  tokenExpiraEm = 0
  if (t && (window as any).google?.accounts?.oauth2) {
    try {
      ;(window as any).google.accounts.oauth2.revoke(t)
    } catch {
      // Revogar é só higiene; se falhar, o token expira sozinho em 1h.
    }
  }
}

/**
 * Devolve um token de acesso válido.
 * `interativo = false` tenta renovar em silêncio; se o Google exigir interação,
 * a promessa é rejeitada e cabe à interface pedir que o usuário clique em conectar.
 */
export function obterToken(interativo = true): Promise<string> {
  if (driveConectado()) return Promise.resolve(tokenAtual as string)

  return carregarGis().then(
    () =>
      new Promise<string>((resolve, reject) => {
        if (!CLIENT_ID) return reject(new Error('VITE_GOOGLE_CLIENT_ID não configurada.'))

        const client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPE,
          prompt: interativo ? '' : 'none',
          callback: (resp: any) => {
            if (resp.error) {
              return reject(
                new Error(
                  resp.error === 'access_denied'
                    ? 'Autorização negada. É preciso permitir o acesso ao Drive para anexar arquivos.'
                    : `Falha na autorização do Google: ${resp.error}`
                )
              )
            }
            tokenAtual = resp.access_token
            // Renova com folga de 1 minuto antes do vencimento real.
            tokenExpiraEm = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000
            resolve(resp.access_token)
          },
          error_callback: (err: any) => {
            reject(new Error(err?.message || 'Não foi possível abrir a janela de autorização do Google.'))
          },
        })

        client.requestAccessToken()
      })
  )
}

function escapeQuery(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/**
 * Procura uma subpasta pelo nome dentro de `parent`; cria se não existir.
 * Sem `parent`, usa a pasta raiz configurada.
 */
export async function encontrarOuCriarPasta(
  token: string,
  nome: string,
  parent?: string
): Promise<string> {
  const parentId = parent || (ROOT_FOLDER_ID as string)
  if (!nome.trim()) return parentId

  const q = [
    `name = '${escapeQuery(nome.trim())}'`,
    `'${parentId}' in parents`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
  ].join(' and ')

  const url =
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}` +
    '&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true'

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Erro ao procurar a pasta no Drive: ${data.error?.message || res.status}`)
  }
  if (data.files?.length) return data.files[0].id

  const criar = await fetch(`${DRIVE_API}/files?fields=id&supportsAllDrives=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: nome.trim(),
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  })
  const criado = await criar.json()
  if (!criar.ok) {
    throw new Error(`Erro ao criar a pasta no Drive: ${criado.error?.message || criar.status}`)
  }
  return criado.id
}

/**
 * Troca o arquivo de pasta no Drive.
 *
 * O Google não tem "mover": troca-se o pai. Por isso lemos os pais atuais
 * primeiro — sem removê-los, o arquivo passaria a existir nos dois lugares.
 */
export async function moverArquivo(token: string, fileId: string, novoPaiId: string): Promise<void> {
  const atual = await fetch(
    `${DRIVE_API}/files/${fileId}?fields=parents&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const dados = await atual.json()
  if (!atual.ok) {
    throw new Error(`Erro ao ler a pasta atual do arquivo: ${dados.error?.message || atual.status}`)
  }

  const paisAtuais: string[] = dados.parents || []
  if (paisAtuais.length === 1 && paisAtuais[0] === novoPaiId) return

  const params = new URLSearchParams({
    addParents: novoPaiId,
    fields: 'id',
    supportsAllDrives: 'true',
  })
  if (paisAtuais.length) params.set('removeParents', paisAtuais.join(','))

  const res = await fetch(`${DRIVE_API}/files/${fileId}?${params}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) {
    const erro = await res.json().catch(() => ({}))
    throw new Error(`Erro ao mover o arquivo no Drive: ${erro.error?.message || res.status}`)
  }
}

/** Envia o arquivo em sessão resumable, direto do navegador para o Google. */
export async function enviarArquivo(
  token: string,
  parentId: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<DriveFileResult> {
  const init = await fetch(
    `${DRIVE_UPLOAD}/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink,size,mimeType`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        name: file.name,
        parents: [parentId],
        ...(file.type ? { mimeType: file.type } : {}),
      }),
    }
  )

  if (!init.ok) {
    const err = await init.text()
    throw new Error(`Erro ao iniciar o envio no Drive: ${err.slice(0, 200)}`)
  }

  const uploadUrl = init.headers.get('location')
  if (!uploadUrl) throw new Error('O Google não devolveu a URL de envio.')

  return new Promise<DriveFileResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl, true)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText))
        } catch {
          reject(new Error('Resposta inesperada do Google Drive.'))
        }
      } else {
        let msg = `O Google recusou o envio (${xhr.status}).`
        try {
          const j = JSON.parse(xhr.responseText)
          if (j.error?.message) msg = j.error.message
        } catch {
          // mantém a mensagem genérica
        }
        reject(new Error(msg))
      }
    }
    xhr.onerror = () => reject(new Error('Falha de rede durante o envio.'))
    xhr.send(file)
  })
}
