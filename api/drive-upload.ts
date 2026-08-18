import crypto from 'node:crypto'

/**
 * Emite uma URL de upload "resumable" do Google Drive.
 *
 * O navegador NÃO envia o arquivo para cá — ele pede só a autorização e depois
 * envia os bytes direto para o Google. Isso evita o limite de ~4,5 MB por
 * requisição das funções serverless do Vercel e permite arquivos grandes
 * (plantas, DWG, PDFs pesados).
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

type ServiceAccount = {
  client_email: string
  private_key: string
}

/** Confere se a chave privada veio inteira (colagens truncadas são o erro mais comum). */
function validarChave(private_key: string): string {
  const key = private_key.replace(/\\n/g, '\n').trim()
  if (!key.includes('-----BEGIN PRIVATE KEY-----') || !key.includes('-----END PRIVATE KEY-----')) {
    throw new Error(
      'A chave privada está incompleta: faltam as marcações -----BEGIN PRIVATE KEY----- e/ou ' +
        '-----END PRIVATE KEY-----. Recole o valor inteiro no Vercel.'
    )
  }
  return key
}

function getServiceAccount(): ServiceAccount {
  // Caminho preferido: duas variáveis simples, sem JSON para dar errado na colagem.
  const emailSeparado = process.env.GOOGLE_CLIENT_EMAIL
  const chaveSeparada = process.env.GOOGLE_PRIVATE_KEY
  if (emailSeparado && chaveSeparada) {
    return {
      client_email: emailSeparado.trim(),
      private_key: validarChave(chaveSeparada),
    }
  }

  // Alternativa: o arquivo .json inteiro numa variável só.
  let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) {
    throw new Error(
      'Credenciais do Google não configuradas. Defina no Vercel as variáveis GOOGLE_CLIENT_EMAIL e ' +
        'GOOGLE_PRIVATE_KEY (recomendado), ou GOOGLE_SERVICE_ACCOUNT_JSON com o arquivo .json completo.'
    )
  }

  // Tolera colagens comuns: BOM, aspas envolvendo tudo, espaços nas pontas.
  raw = raw.trim().replace(/^﻿/, '')
  if (
    (raw.startsWith("'") && raw.endsWith("'")) ||
    (raw.startsWith('"') && raw.endsWith('"') && !raw.startsWith('{'))
  ) {
    raw = raw.slice(1, -1).trim()
  }

  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Caso comum: ao copiar do editor, perdem-se as chaves externas { }.
    // Tentamos reconstruir — e logo abaixo validamos que a chave privada
    // veio inteira, para não aceitar silenciosamente algo truncado.
    let tentativa = raw
    if (!tentativa.startsWith('{')) tentativa = (tentativa.startsWith('"') ? '{' : '{"') + tentativa
    if (!tentativa.endsWith('}')) tentativa = tentativa + '}'

    try {
      parsed = JSON.parse(tentativa)
    } catch (e2: any) {
      // Diagnóstico sem vazar a chave privada: só tamanho e o começo do arquivo,
      // que em toda conta de serviço é sempre {"type": "service_account"...
      throw new Error(
        `GOOGLE_SERVICE_ACCOUNT_JSON não é um JSON válido (${e2.message}). ` +
          `Tamanho recebido: ${raw.length} caracteres. Começa com: ${JSON.stringify(raw.slice(0, 24))}. ` +
          'Cole o conteúdo completo do arquivo .json baixado do Google Cloud, do "{" até o "}" final.'
      )
    }
  }

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON incompleta: faltam client_email e/ou private_key. ' +
        'Confirme que colou o arquivo de CHAVE da conta de serviço, e não outro JSON do projeto.'
    )
  }

  return {
    client_email: parsed.client_email,
    private_key: validarChave(String(parsed.private_key)),
  }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Gera um access token do Google via JWT assinado com a chave da conta de serviço. */
async function getAccessToken(): Promise<string> {
  const sa = getServiceAccount()
  const now = Math.floor(Date.now() / 1000)

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/drive',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    })
  )

  const signer = crypto.createSign('RSA-SHA256')
  signer.update(`${header}.${claim}`)
  const signature = base64url(signer.sign(sa.private_key))
  const jwt = `${header}.${claim}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Falha ao autenticar no Google: ${data.error_description || data.error || res.status}`)
  }
  return data.access_token as string
}

/**
 * Aceita tanto o ID puro quanto a URL completa da pasta colada do navegador,
 * ex.: https://drive.google.com/drive/folders/ABC123?usp=sharing
 */
function normalizarFolderId(valor: string): string {
  let id = valor.trim().replace(/^["']|["']$/g, '')
  const match = id.match(/\/folders\/([^/?#\s]+)/)
  if (match) id = match[1]
  // Remove parâmetros de query que às vezes vêm junto.
  id = id.split('?')[0].split('#')[0].trim()
  return id
}

/** Escapa aspas simples para a sintaxe de busca do Drive. */
function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/** Procura a subpasta do projeto dentro da pasta raiz; cria se não existir. */
async function findOrCreateFolder(token: string, parentId: string, name: string): Promise<string> {
  const q = [
    `name = '${escapeQuery(name)}'`,
    `'${parentId}' in parents`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
  ].join(' and ')

  const searchUrl =
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}` +
    '&fields=files(id,name)&pageSize=1' +
    '&supportsAllDrives=true&includeItemsFromAllDrives=true'

  const found = await fetch(searchUrl, { headers: { Authorization: `Bearer ${token}` } })
  const foundData = await found.json()
  if (!found.ok) {
    const msg = foundData.error?.message || String(found.status)
    if (/not found/i.test(msg)) {
      throw new Error(
        `A pasta raiz do Drive não foi encontrada (ID recebido: "${parentId}"). ` +
          'Confira a variável GOOGLE_DRIVE_FOLDER_ID no Vercel e certifique-se de que a pasta foi ' +
          'compartilhada como Editor com o e-mail da conta de serviço.'
      )
    }
    throw new Error(`Erro ao procurar a pasta no Drive: ${msg}`)
  }
  if (foundData.files?.length) return foundData.files[0].id as string

  const created = await fetch(`${DRIVE_API}/files?fields=id&supportsAllDrives=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  })
  const createdData = await created.json()
  if (!created.ok) {
    throw new Error(`Erro ao criar a pasta no Drive: ${createdData.error?.message || created.status}`)
  }
  return createdData.id as string
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido' })
    return
  }

  try {
    const rootId = normalizarFolderId(process.env.GOOGLE_DRIVE_FOLDER_ID || '')
    if (!rootId) {
      throw new Error(
        'GOOGLE_DRIVE_FOLDER_ID está vazia ou inválida no Vercel. ' +
          'Cole o ID da pasta (o trecho da URL depois de /folders/) ou a URL completa da pasta.'
      )
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const { fileName, mimeType, folderName } = body as {
      fileName?: string
      mimeType?: string
      folderName?: string
    }

    if (!fileName) {
      res.status(400).json({ error: 'fileName é obrigatório.' })
      return
    }

    const token = await getAccessToken()

    // Cada projeto ganha sua própria subpasta, usando o "Nome da pasta" dos dados do cliente.
    const parentId = folderName?.trim()
      ? await findOrCreateFolder(token, rootId, folderName.trim())
      : rootId

    // Abre uma sessão de upload resumable: o navegador envia os bytes direto ao Google.
    const initRes = await fetch(
      `${DRIVE_UPLOAD}/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink,size,mimeType`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          name: fileName,
          parents: [parentId],
          ...(mimeType ? { mimeType } : {}),
        }),
      }
    )

    if (!initRes.ok) {
      const errText = await initRes.text()
      throw new Error(`Erro ao iniciar o upload no Drive: ${errText}`)
    }

    const uploadUrl = initRes.headers.get('location')
    if (!uploadUrl) throw new Error('O Google não devolveu a URL de upload.')

    res.status(200).json({ uploadUrl, folderId: parentId })
  } catch (err: any) {
    console.error('[drive-upload]', err)
    res.status(500).json({ error: err.message || 'Erro inesperado ao preparar o upload.' })
  }
}
