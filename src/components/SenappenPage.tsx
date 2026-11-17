import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import { useLembrado } from '../lib/lembrar'
import { usePermissoes } from '../lib/permissoes'
import { nomeDoUsuario } from '../lib/pendencias'
import Login from './Login'
import SenappenBlocos from './SenappenBlocos'
import SenappenAgenda from './SenappenAgenda'
import SenappenModelos from './SenappenModelos'
import type { Presente, Tudo } from '../lib/senappen'
import {
  SITUACOES,
  baterPresenca,
  carregarPresenca,
  carregarTudo,
  chaveDoItem,
  dataHora,
  horaCheia,
  nomeDoBloco,
  relogio,
  sairDaPresenca,
  useTempoReal,
} from '../lib/senappen'

type Aba = 'blocos' | 'agenda' | 'modelos'

const ABAS: [Aba, string][] = [
  ['blocos', 'Blocos'],
  ['agenda', 'Agenda'],
  ['modelos', 'Modelos de checklist'],
]

/**
 * SENAPPEN — endereço próprio, como o ponto, o comercial e a MEF.
 *
 * Quem passa o dia conferindo bloco abre direto aqui. O login é o mesmo da
 * BIM Fire: acabou a senha única do site, e o nome que carimba cada item é o
 * de quem está logado, não o que a pessoa escolheu numa caixinha.
 */
export default function SenappenPage() {
  const session = useSessao()
  const { pode, carregando: carregandoPerm } = usePermissoes()
  const [aba, setAba] = useLembrado<Aba>('senappen-aba', 'blocos')

  const [eu, setEu] = useState('')
  const [tudo, setTudo] = useState<Tudo | null>(null)
  const [presentes, setPresentes] = useState<Presente[]>([])
  const [erro, setErro] = useState('')
  const [agora, setAgora] = useState(Date.now())

  // Identificador desta aba do navegador: a mesma pessoa pode estar em dois
  // computadores, e cada um aparece onde está.
  const meuPosto = useRef('p' + Math.random().toString(36).slice(2, 10))

  const recarregar = useCallback(async () => {
    try {
      const [t, p] = await Promise.all([carregarTudo(), carregarPresenca()])
      setTudo(t)
      setPresentes(p)
      setErro('')
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [])

  useEffect(() => {
    if (!session) return
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      const { data: perfil } = await supabase
        .from('user_profiles')
        .select('nome')
        .eq('user_id', data.user?.id || '')
        .maybeSingle()
      const nome = (perfil as { nome: string } | null)?.nome || (await nomeDoUsuario()) || 'Sem nome'
      setEu(nome)
    })()
    recarregar()
  }, [session, recarregar])

  // O tempo real avisa; recarregar tudo é mais simples e mais seguro do que
  // adivinhar o que mudou — e a base aqui é pequena.
  useTempoReal(() => {
    recarregar()
  })

  /** Bate presença de 20 em 20 segundos e some ao fechar a página. */
  useEffect(() => {
    if (!eu) return
    const posto = meuPosto.current
    const minhaSessao = () =>
      (tudo?.sessoes || []).find((s) => !s.fim && s.pessoa === eu) || null
    const bater = () => {
      const s = minhaSessao()
      baterPresenca({
        id: posto,
        pessoa: eu,
        bloco_id: s?.bloco_id || null,
        modelo_id: null,
        ativo: !!s,
      }).catch(() => {})
    }
    bater()
    const t = setInterval(bater, 20000)
    const sair = () => sairDaPresenca(posto).catch(() => {})
    window.addEventListener('beforeunload', sair)
    return () => {
      clearInterval(t)
      window.removeEventListener('beforeunload', sair)
      sair()
    }
  }, [eu, tudo])

  /** O relógio da tela: cronômetro de quem está com bloco aberto. */
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  if (session === undefined || carregandoPerm) {
    return <p className="text-sm text-slate-400 text-center py-20">Carregando...</p>
  }
  if (!session) return <Login />
  if (!pode('senappen.ver')) {
    return (
      <div className="min-h-screen bg-[#F7F6F5] flex items-center justify-center">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm py-12 px-8 text-center">
          <p className="text-3xl mb-2">🔒</p>
          <p className="text-sm text-slate-600">Seu perfil não tem acesso ao SENAPPEN.</p>
          <a href="/" className="text-xs text-indigo-700 hover:underline mt-2 inline-block">
            Voltar para a gestão de projetos
          </a>
        </div>
      </div>
    )
  }

  const podeEditar = pode('senappen.editar')
  const podeRevisar = pode('senappen.revisar')
  const podeAdministrar = pode('senappen.administrar')

  const minhaSessao = (tudo?.sessoes || []).find((s) => !s.fim && s.pessoa === eu) || null

  return (
    <div className="min-h-screen bg-[#F7F6F5]">
      <header className="bg-carvao-900 text-white">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold leading-tight">Checklist SENAPPEN</h1>
            <p className="text-[11px] text-white/50 leading-tight">
              Revisão por bloco · olá, {eu || '...'}
            </p>
          </div>
          <a
            href="/"
            className="text-[11px] text-white/70 hover:text-white px-2.5 py-1.5 rounded-lg border border-white/20"
          >
            Gestão de Projetos
          </a>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-[11px] text-white/60 hover:text-white"
          >
            Sair
          </button>
        </div>
      </header>

      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-4 flex gap-1">
          {ABAS.map((par) => (
            <button
              key={par[0]}
              onClick={() => setAba(par[0])}
              className={
                'text-xs font-medium px-3 py-2.5 border-b-2 ' +
                (aba === par[0]
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700')
              }
            >
              {par[1]}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-[1600px] mx-auto px-4 py-4 space-y-3">
        {erro && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {erro}
          </p>
        )}

        <QuemEstaOnline presentes={presentes} tudo={tudo} eu={eu} agora={agora} />

        {!tudo ? (
          <p className="text-sm text-slate-400 text-center py-16">Carregando o checklist...</p>
        ) : aba === 'blocos' ? (
          <SenappenBlocos
            tudo={tudo}
            eu={eu}
            agora={agora}
            minhaSessao={minhaSessao}
            podeEditar={podeEditar}
            podeRevisar={podeRevisar}
            podeAdministrar={podeAdministrar}
            aoMudar={recarregar}
            exportar={<Exportacoes tudo={tudo} podeAdministrar={podeAdministrar} aoMudar={recarregar} />}
          />
        ) : aba === 'agenda' ? (
          <SenappenAgenda tudo={tudo} agora={agora} podeEditar={podeEditar} aoMudar={recarregar} />
        ) : (
          <SenappenModelos tudo={tudo} podeAdministrar={podeAdministrar} aoMudar={recarregar} />
        )}
      </main>
    </div>
  )
}

/**
 * Quem está na tela agora.
 *
 * Era o painel que fazia a equipe parar de pegar o mesmo bloco duas vezes.
 * Some sozinho em 45 segundos quando a pessoa fecha a página.
 */
function QuemEstaOnline({
  presentes,
  tudo,
  eu,
  agora,
}: {
  presentes: Presente[]
  tudo: Tudo | null
  eu: string
  agora: number
}) {
  const nome = (id: string | null) => {
    const b = (tudo?.blocos || []).find((x) => x.id === id)
    return b ? nomeDoBloco(b) : null
  }
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
      <p className="text-[10px] font-semibold uppercase text-slate-500 mb-1.5">
        Equipe online e atividades
      </p>
      {presentes.length === 0 ? (
        <p className="text-[11px] text-slate-400">Ninguém mais com a tela aberta agora.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {presentes.map((p) => {
            const sessao = (tudo?.sessoes || []).find(
              (s) => !s.fim && s.pessoa === p.pessoa
            )
            return (
              <div
                key={p.id}
                className={
                  'border rounded-xl px-3 py-1.5 text-[11px] ' +
                  (p.ativo ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50')
                }
              >
                <span className="font-semibold text-slate-700">
                  {p.pessoa}
                  {p.pessoa === eu ? ' (você)' : ''}
                </span>
                <span className="block text-slate-500">
                  {nome(p.bloco_id) || 'sem bloco aberto'}
                  {sessao ? ' · ' + relogio(agora - new Date(sessao.inicio).getTime()) : ''}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Baixar e restaurar — os mesmos arquivos do app antigo. */
function Exportacoes({
  tudo,
  podeAdministrar,
  aoMudar,
}: {
  tudo: Tudo
  podeAdministrar: boolean
  aoMudar: () => void
}) {
  const arquivo = useRef<HTMLInputElement>(null)

  function baixar(nome: string, conteudo: string, tipo: string) {
    const url = URL.createObjectURL(new Blob([conteudo], { type: tipo + ';charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = nome
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  function carimbo() {
    const d = new Date()
    return (
      d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0')
    )
  }

  // Ponto e vírgula e BOM: é o que faz o Excel em português abrir o arquivo
  // em colunas em vez de jogar tudo numa só.
  function csv(linhas: (string | null)[][]) {
    return (
      '\ufeff' +
      linhas
        .map((l) =>
          l
            .map((v) => {
              const t = v == null ? '' : String(v)
              return /[";\n,]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t
            })
            .join(';')
        )
        .join('\r\n')
    )
  }

  function checklistCsv() {
    const linhas: (string | null)[][] = [
      ['Bloco', 'Checklist', 'Item', 'Situação', 'Feito por', 'Data feito', 'Revisado por', 'Data revisão', 'Nota'],
    ]
    for (const b of tudo.blocos) {
      for (const mid of b.modelos) {
        const m = tudo.modelos.find((x) => x.id === mid)
        if (!m) continue
        for (const item of m.itens) {
          const chave = chaveDoItem(mid, item.k)
          const d = tudo.marcacoes.find((x) => x.bloco_id === b.id && x.chave === chave)
          linhas.push([
            nomeDoBloco(b),
            m.nome,
            item.t,
            SITUACOES[d?.status || 'p'],
            d?.feito_por || '',
            dataHora(d?.feito_em || null),
            d?.revisado_por || '',
            dataHora(d?.revisado_em || null),
            d?.nota || '',
          ])
        }
      }
    }
    baixar('senappen-checklist-' + carimbo() + '.csv', csv(linhas), 'text/csv')
  }

  function agendaCsv() {
    const linhas: (string | null)[][] = [
      ['Data', 'Pessoa', 'Bloco', 'Tipo', 'Início', 'Fim', 'Duração', 'Motivo da parada'],
    ]
    for (const s of [...tudo.sessoes].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
      const b = tudo.blocos.find((x) => x.id === s.bloco_id)
      linhas.push([
        new Date(s.inicio).toLocaleDateString('pt-BR'),
        s.pessoa,
        b ? nomeDoBloco(b) : s.bloco_id,
        s.tipo,
        horaCheia(s.inicio),
        s.fim ? horaCheia(s.fim) : 'em andamento',
        s.fim ? relogio(new Date(s.fim).getTime() - new Date(s.inicio).getTime()) : '',
        s.motivo,
      ])
    }
    baixar('senappen-agenda-' + carimbo() + '.csv', csv(linhas), 'text/csv')
  }

  function jornadaCsv() {
    const por = new Map<string, { quando: number; ms: number; blocos: Set<string> }>()
    for (const s of tudo.sessoes) {
      const ini = new Date(s.inicio).getTime()
      const chave = new Date(s.inicio).toLocaleDateString('pt-BR') + '|' + s.pessoa
      const q = por.get(chave) || { quando: ini, ms: 0, blocos: new Set<string>() }
      q.ms += (s.fim ? new Date(s.fim).getTime() : Date.now()) - ini
      if (s.bloco_id) q.blocos.add(s.bloco_id)
      por.set(chave, q)
    }
    const linhas: (string | null)[][] = [['Data', 'Pessoa', 'Total', 'Blocos']]
    for (const [chave, q] of [...por.entries()].sort((a, b) => a[1].quando - b[1].quando)) {
      const partes = chave.split('|')
      linhas.push([
        partes[0],
        partes[1],
        relogio(q.ms),
        [...q.blocos]
          .map((id) => {
            const b = tudo.blocos.find((x) => x.id === id)
            return b ? nomeDoBloco(b) : id
          })
          .join(' + '),
      ])
    }
    baixar('senappen-jornada-' + carimbo() + '.csv', csv(linhas), 'text/csv')
  }

  function backup() {
    baixar(
      'senappen-backup-' + carimbo() + '.json',
      JSON.stringify({ v: 2, ...tudo }, null, 1),
      'application/json'
    )
  }

  /**
   * Restaura o backup do app antigo.
   *
   * Lê o formato antigo (blocks/sessions/log/config) e grava nas tabelas de
   * cá. É o caminho para trazer o trabalho que a equipe já fez sem redigitar
   * item por item.
   */
  async function restaurar(f: File) {
    try {
      const j = JSON.parse(await f.text())
      if (!j || (!j.blocks && !j.blocos)) throw new Error('Arquivo sem blocos.')
      if (
        !confirm(
          'Restaurar este backup? As marcações dos blocos que estiverem no arquivo serão substituídas.'
        )
      )
        return

      if (j.config) {
        const modelos = Array.isArray(j.config.models) ? j.config.models : []
        for (const m of modelos) {
          await supabase.from('sen_modelos').upsert({
            id: String(m.id),
            nome: String(m.name || 'Modelo'),
            itens: m.items || [],
          })
        }
        const bl = Array.isArray(j.config.bl) ? j.config.bl : []
        for (let i = 0; i < bl.length; i++) {
          await supabase.from('sen_blocos').upsert({
            id: 'bl' + String(bl[i].c).toLowerCase(),
            codigo: String(bl[i].c),
            nome: String(bl[i].n),
            ordem: i + 1,
          })
        }
      }

      const linhas: Record<string, unknown>[] = []
      for (const [blocoId, bloco] of Object.entries<any>(j.blocks || {})) {
        if (Array.isArray(bloco?.models)) {
          await supabase.from('sen_blocos').update({ modelos: bloco.models }).eq('id', blocoId)
        }
        for (const [chave, d] of Object.entries<any>(bloco?.items || {})) {
          linhas.push({
            bloco_id: blocoId,
            chave,
            modelo_id: chave.startsWith('m:') ? chave.split(':')[1] : 'internal',
            status: d?.s || 'p',
            feito_por: d?.d || null,
            feito_em: d?.dt ? new Date(d.dt).toISOString() : null,
            revisado_por: d?.r || null,
            revisado_em: d?.rt ? new Date(d.rt).toISOString() : null,
            nota: d?.n || null,
          })
        }
      }
      for (let i = 0; i < linhas.length; i += 500) {
        await supabase.from('sen_itens').upsert(linhas.slice(i, i + 500), {
          onConflict: 'bloco_id,chave',
        })
      }

      const sessoes = (j.sessions || []).map((s: any) => ({
        bloco_id: s.b,
        pessoa: s.p,
        tipo: s.k,
        inicio: new Date(s.s).toISOString(),
        fim: s.e ? new Date(s.e).toISOString() : null,
        motivo: s.w || null,
        editado: !!s.ed,
      }))
      for (let i = 0; i < sessoes.length; i += 500) {
        await supabase.from('sen_sessoes').insert(sessoes.slice(i, i + 500))
      }

      const registros = (j.log || []).map((l: any) => ({
        quando: new Date(l.ts).toISOString(),
        pessoa: l.p,
        bloco_id: l.b,
        texto: l.t,
      }))
      for (let i = 0; i < registros.length; i += 500) {
        await supabase.from('sen_log').insert(registros.slice(i, i + 500))
      }

      alert('Backup restaurado: ' + linhas.length + ' marcações e ' + sessoes.length + ' registros de tempo.')
      aoMudar()
    } catch (e) {
      alert('Não consegui restaurar: ' + (e as Error).message)
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <Botao onClick={backup}>⬇ Backup (.json)</Botao>
      <Botao onClick={checklistCsv}>⬇ Checklist (.csv)</Botao>
      <Botao onClick={agendaCsv}>⬇ Agenda (.csv)</Botao>
      <Botao onClick={jornadaCsv}>⬇ Jornada (.csv)</Botao>
      {podeAdministrar && (
        <>
          <Botao onClick={() => arquivo.current?.click()}>⬆ Restaurar backup</Botao>
          <input
            ref={arquivo}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) restaurar(f)
            }}
          />
        </>
      )}
    </div>
  )
}

function Botao({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
    >
      {children}
    </button>
  )
}

