import { useEffect, useMemo, useState } from 'react'
import { supabase, carregarTabelaCompleta } from '../lib/supabase'
import { hojeLocal, minutosLegiveis } from '../lib/ponto'

/**
 * Minhas horas — o tempo medido pelo BIM Fire Monitor no computador de cada
 * projetista, agrupado pela pasta do projeto em que ele estava trabalhando.
 *
 * A pessoa confere, escolhe as tarefas e lança: o lançamento vira um
 * "Assumir projeto" comum (project_activities + activity_task_hours), então
 * relatórios, produção por hora e a trava da saída do ponto continuam iguais.
 *
 * A identificação é pelo mesmo nome + PIN do ponto, porque o escritório divide
 * um login. O banco confere o PIN em cada chamada e só libera de segunda a
 * sexta (o administrador vê sempre).
 */

type Grupo = {
  chave: string
  com_pasta: boolean
  ativo_seg: number
  arquivos: number
  project_id: string | null
  projeto: string | null
  confirmado: boolean
  lancado_horas: number
}

type Lancado = {
  activity_id: string
  projeto: string | null
  project_id: string
  horas: number | null
  descricao: string | null
  monitor: boolean
}

type Dia = {
  colaborador: string
  dia: string
  sem_monitor: boolean
  ativo_seg: number
  ocioso_seg: number
  sem_arquivo_seg: number
  grupos: Grupo[]
  lancados: Lancado[]
}

type Tarefa = { id: string; nome: string; codigo: string | null; status: string | null; minha: boolean; parent_id: string | null }
type ProjetoBusca = { id: string; numero: number; nome: string; status: string | null }
type Membro = { nome: string; ativo: boolean }

const SEM_ARQUIVO = '__sem_arquivo__'

function diaDaSemana(iso: string): number {
  // 0 = domingo … 6 = sábado, no fuso de Brasília
  return new Date(`${iso}T12:00:00`).getDay()
}

function dataBR(iso: string) {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

const horasDe = (seg: number) => Math.round((seg / 3600) * 100) / 100
const fmtHoras = (h: number) => minutosLegiveis(h * 60)

function mensagemDeErro(e: any): string {
  const m = String(e?.message || e || '')
  return m.replace(/^.*?ERROR:\s*/i, '')
}

export default function MinhasHorasView() {
  const [membros, setMembros] = useState<Membro[]>([])
  const [colaborador, setColaborador] = useState(() => localStorage.getItem('ponto:colaborador') || '')
  const [pin, setPin] = useState('')
  const [pinOk, setPinOk] = useState('') // PIN confirmado da sessão desta tela (só em memória)
  const [dia, setDia] = useState(hojeLocal())
  const [dados, setDados] = useState<Dia | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [admin, setAdmin] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)

  const hoje = hojeLocal()
  const fimDeSemana = [0, 6].includes(diaDaSemana(hoje))
  const bloqueado = fimDeSemana && !admin

  useEffect(() => {
    carregarTabelaCompleta<Membro>('team_members', 'nome, ativo').then((m) => setMembros(m.filter((x) => x.ativo)))
    supabase.rpc('mon_is_admin').then(({ data }) => setAdmin(!!data))
  }, [])

  async function carregar(pinUsado = pinOk, diaUsado = dia) {
    setErro('')
    setCarregando(true)
    const { data, error } = await supabase.rpc('mon_minhas_horas', {
      p_colaborador: colaborador,
      p_pin: pinUsado,
      p_dia: diaUsado,
    })
    setCarregando(false)
    if (error) {
      setErro(mensagemDeErro(error))
      if (/PIN/i.test(error.message)) {
        setPinOk('')
        setDados(null)
      }
      return
    }
    setDados(data as Dia)
  }

  async function entrar() {
    if (!colaborador) return setErro('Escolha o seu nome.')
    if (pin.length < 4) return setErro('Digite o seu PIN.')
    localStorage.setItem('ponto:colaborador', colaborador)
    setPinOk(pin)
    setPin('')
    await carregar(pin)
  }

  function sair() {
    setPinOk('')
    setDados(null)
    setAberto(null)
  }

  function mudarDia(novo: string) {
    if (!novo || novo > hoje) return
    setDia(novo)
    setAberto(null)
    if (pinOk) carregar(pinOk, novo)
  }

  const totalLancado = useMemo(
    () => (dados?.lancados || []).reduce((s, l) => s + (Number(l.horas) || 0), 0),
    [dados]
  )

  if (bloqueado) {
    return (
      <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center">
        <p className="text-3xl mb-2">🗓️</p>
        <h2 className="text-base font-semibold text-slate-800">Minhas horas abre de segunda a sexta</h2>
        <p className="text-sm text-slate-500 mt-1">Volte na segunda-feira para conferir e lançar as horas da semana.</p>
      </div>
    )
  }

  // --- Identificação --------------------------------------------------------
  if (!pinOk) {
    return (
      <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Minhas horas</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tempo ativo medido no seu computador, separado por projeto. Use o mesmo PIN do ponto.
          </p>
        </div>
        <select
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
          value={colaborador}
          onChange={(e) => setColaborador(e.target.value)}
        >
          <option value="">Seu nome…</option>
          {membros.map((m) => (
            <option key={m.nome} value={m.nome}>
              {m.nome}
            </option>
          ))}
        </select>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm tracking-widest"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          onKeyDown={(e) => e.key === 'Enter' && entrar()}
        />
        {erro && <p className="text-xs text-red-600">{erro}</p>}
        <button
          onClick={entrar}
          disabled={carregando}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md py-2 disabled:opacity-60"
        >
          {carregando ? 'Abrindo…' : 'Ver minhas horas'}
        </button>
        {fimDeSemana && admin && (
          <p className="text-[11px] text-amber-600">Fim de semana: liberado só para o administrador.</p>
        )}
      </div>
    )
  }

  // --- Dia ------------------------------------------------------------------
  const ativoH = horasDe(dados?.ativo_seg || 0)
  const faltaH = Math.max(0, Math.round((ativoH - totalLancado) * 100) / 100)

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-slate-800 mr-2">
          Minhas horas · <span className="text-indigo-600">{dados?.colaborador || colaborador}</span>
        </h2>
        <button
          onClick={() => {
            const d = new Date(`${dia}T12:00:00`)
            d.setDate(d.getDate() - 1)
            mudarDia(d.toISOString().slice(0, 10))
          }}
          className="text-xs border border-slate-200 bg-white rounded-md px-2 py-1 hover:bg-slate-50"
        >
          ‹
        </button>
        <input
          type="date"
          value={dia}
          max={hoje}
          onChange={(e) => mudarDia(e.target.value)}
          className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
        />
        <button
          onClick={() => {
            const d = new Date(`${dia}T12:00:00`)
            d.setDate(d.getDate() + 1)
            mudarDia(d.toISOString().slice(0, 10))
          }}
          disabled={dia >= hoje}
          className="text-xs border border-slate-200 bg-white rounded-md px-2 py-1 hover:bg-slate-50 disabled:opacity-40"
        >
          ›
        </button>
        <span className="ml-auto" />
        <button onClick={() => carregar()} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1">
          Atualizar
        </button>
        <button onClick={sair} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1">
          Sair
        </button>
      </div>

      {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
      {carregando && !dados && <p className="text-sm text-slate-400 text-center py-10">Carregando…</p>}

      {dados && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Indicador rotulo="Tempo ativo" valor={fmtHoras(ativoH)} />
            <Indicador rotulo="Ocioso" valor={fmtHoras(horasDe(dados.ocioso_seg))} discreto />
            <Indicador rotulo="Já lançado" valor={fmtHoras(totalLancado)} />
            <Indicador rotulo="Falta lançar" valor={fmtHoras(faltaH)} destaque={faltaH >= 0.25} />
          </div>

          {dados.sem_monitor && (
            <p className="text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              O monitor ainda não está instalado no seu computador, então não há tempo medido. Os lançamentos do dia
              aparecem abaixo.
            </p>
          )}

          {!dados.sem_monitor && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm divide-y divide-slate-100">
              <div className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Onde você trabalhou · {dataBR(dados.dia)}
              </div>
              {dados.grupos.length === 0 && dados.sem_arquivo_seg < 60 && (
                <p className="px-4 py-6 text-sm text-slate-400 text-center">Nenhum tempo ativo registrado neste dia.</p>
              )}
              {dados.grupos.map((g) => (
                <GrupoLinha
                  key={g.chave}
                  grupo={g}
                  aberto={aberto === g.chave}
                  onAbrir={() => setAberto(aberto === g.chave ? null : g.chave)}
                  colaborador={colaborador}
                  pin={pinOk}
                  dia={dia}
                  onLancado={() => {
                    setAberto(null)
                    carregar()
                  }}
                />
              ))}
              {dados.sem_arquivo_seg >= 60 && (
                <GrupoLinha
                  grupo={{
                    chave: SEM_ARQUIVO,
                    com_pasta: false,
                    ativo_seg: dados.sem_arquivo_seg,
                    arquivos: 0,
                    project_id: null,
                    projeto: null,
                    confirmado: false,
                    lancado_horas: 0,
                  }}
                  aberto={aberto === SEM_ARQUIVO}
                  onAbrir={() => setAberto(aberto === SEM_ARQUIVO ? null : SEM_ARQUIVO)}
                  colaborador={colaborador}
                  pin={pinOk}
                  dia={dia}
                  onLancado={() => {
                    setAberto(null)
                    carregar()
                  }}
                />
              )}
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
              Lançado em {dataBR(dados.dia)}
            </div>
            {dados.lancados.length === 0 ? (
              <p className="px-4 py-5 text-sm text-slate-400 text-center">Nada lançado ainda.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {dados.lancados.map((l) => (
                  <li key={l.activity_id} className="px-4 py-2.5 flex items-start gap-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-700 truncate">{l.projeto || 'Projeto'}</p>
                      {l.descricao && <p className="text-xs text-slate-500 line-clamp-2">{l.descricao}</p>}
                    </div>
                    {l.monitor && (
                      <span className="text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-100 rounded px-1.5 py-0.5">
                        medido
                      </span>
                    )}
                    <span className="font-semibold text-slate-700 tabular-nums">
                      {l.horas != null ? fmtHoras(Number(l.horas)) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            Tempo ativo = teclado ou mouse usados nos últimos 2 minutos. O lançamento entra no histórico do projeto como
            um “Assumir projeto” normal.
          </p>
        </>
      )}
    </div>
  )
}

function Indicador({ rotulo, valor, destaque, discreto }: { rotulo: string; valor: string; destaque?: boolean; discreto?: boolean }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 shadow-sm ${
        destaque ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'
      }`}
    >
      <p className="text-[11px] text-slate-500">{rotulo}</p>
      <p className={`text-xl font-semibold tabular-nums ${discreto ? 'text-slate-400' : 'text-slate-800'}`}>{valor}</p>
    </div>
  )
}

function GrupoLinha({
  grupo,
  aberto,
  onAbrir,
  colaborador,
  pin,
  dia,
  onLancado,
}: {
  grupo: Grupo
  aberto: boolean
  onAbrir: () => void
  colaborador: string
  pin: string
  dia: string
  onLancado: () => void
}) {
  const semArquivo = grupo.chave === SEM_ARQUIVO
  const medidoH = horasDe(grupo.ativo_seg)
  const restanteH = Math.max(0, Math.round((medidoH - Number(grupo.lancado_horas || 0)) * 100) / 100)
  const lancadoTudo = !semArquivo && restanteH < 0.05

  return (
    <div className={aberto ? 'bg-indigo-50/40' : ''}>
      <button onClick={onAbrir} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">
            {semArquivo ? 'Sem arquivo identificado' : grupo.chave}
          </p>
          <p className="text-xs text-slate-500 truncate">
            {semArquivo
              ? 'Navegador, e-mail, WhatsApp e programas sem arquivo aberto'
              : grupo.projeto
                ? `${grupo.confirmado ? '' : 'Sugestão: '}${grupo.projeto}`
                : 'Projeto não identificado — escolha ao lançar'}
          </p>
        </div>
        {Number(grupo.lancado_horas) > 0 && (
          <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5">
            lançado {fmtHoras(Number(grupo.lancado_horas))}
          </span>
        )}
        <span className="text-sm font-semibold tabular-nums text-slate-700 w-16 text-right">{fmtHoras(medidoH)}</span>
        <span
          className={`text-xs font-medium rounded-md px-2.5 py-1 ${
            lancadoTudo ? 'text-slate-400' : 'bg-indigo-600 text-white'
          }`}
        >
          {aberto ? 'Fechar' : lancadoTudo ? 'Lançar mais' : 'Lançar'}
        </span>
      </button>
      {aberto && (
        <FormLancar
          grupo={grupo}
          sugestaoH={semArquivo ? medidoH : restanteH || medidoH}
          colaborador={colaborador}
          pin={pin}
          dia={dia}
          onLancado={onLancado}
        />
      )}
    </div>
  )
}

function FormLancar({
  grupo,
  sugestaoH,
  colaborador,
  pin,
  dia,
  onLancado,
}: {
  grupo: Grupo
  sugestaoH: number
  colaborador: string
  pin: string
  dia: string
  onLancado: () => void
}) {
  const semArquivo = grupo.chave === SEM_ARQUIVO
  const [projeto, setProjeto] = useState<{ id: string; rotulo: string } | null>(
    grupo.project_id && grupo.projeto ? { id: grupo.project_id, rotulo: grupo.projeto } : null
  )
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<ProjetoBusca[]>([])
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [horasTarefa, setHorasTarefa] = useState<Record<string, string>>({})
  const [total, setTotal] = useState(String(sugestaoH.toFixed(2)))
  const [descricao, setDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [trocando, setTrocando] = useState(!projeto)

  // Tarefas do projeto escolhido
  useEffect(() => {
    if (!projeto) return setTarefas([])
    supabase
      .rpc('mon_tarefas_do_projeto', { p_colaborador: colaborador, p_pin: pin, p_dia: dia, p_project_id: projeto.id })
      .then(({ data, error }) => {
        if (error) return setErro(mensagemDeErro(error))
        setTarefas((data as Tarefa[]) || [])
        setHorasTarefa({})
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projeto?.id])

  // Busca de projeto
  useEffect(() => {
    if (!trocando || busca.trim().length < 2) return setResultados([])
    const t = setTimeout(() => {
      supabase.rpc('mon_buscar_projetos', { p_texto: busca.trim() }).then(({ data }) => setResultados((data as ProjetoBusca[]) || []))
    }, 250)
    return () => clearTimeout(t)
  }, [busca, trocando])

  const marcadas = Object.keys(horasTarefa)
  const somaTarefas = marcadas.reduce((s, id) => s + (Number(horasTarefa[id].replace(',', '.')) || 0), 0)
  const horasFinais = marcadas.length ? somaTarefas : Number(total.replace(',', '.')) || 0

  function alternarTarefa(id: string) {
    setHorasTarefa((atual) => {
      const novo = { ...atual }
      if (id in novo) delete novo[id]
      else novo[id] = ''
      // Reparte o total entre as marcadas, em partes iguais (como no Assumir projeto)
      const ids = Object.keys(novo)
      const base = Number(total.replace(',', '.')) || 0
      // Centavos de hora: as primeiras ficam com a fatia arredondada para baixo e a
      // última com o resto, para a soma bater exatamente com o total.
      const fatia = ids.length ? Math.floor((base / ids.length) * 100) / 100 : 0
      ids.forEach((k, i) => {
        const v = i === ids.length - 1 ? base - fatia * (ids.length - 1) : fatia
        novo[k] = (Math.round(v * 100) / 100).toFixed(2)
      })
      return novo
    })
  }

  async function salvar() {
    setErro('')
    if (!projeto) return setErro('Escolha o projeto.')
    if (horasFinais <= 0) return setErro('Informe as horas.')
    if (descricao.trim().length < 25) return setErro('Descreva o que foi feito (pelo menos 25 caracteres).')
    setSalvando(true)
    const { error } = await supabase.rpc('mon_lancar', {
      p_colaborador: colaborador,
      p_pin: pin,
      p_dia: dia,
      p_chave: semArquivo ? null : grupo.chave,
      p_project_id: projeto.id,
      p_descricao: descricao.trim(),
      p_tarefas: marcadas.map((id) => ({ task_id: id, horas: Number(horasTarefa[id].replace(',', '.')) || 0 })),
      p_horas: marcadas.length ? null : horasFinais,
    })
    setSalvando(false)
    if (error) return setErro(mensagemDeErro(error))
    onLancado()
  }

  return (
    <div className="px-4 pb-4 space-y-3">
      {/* Projeto */}
      <div className="bg-white border border-slate-200 rounded-lg p-3">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Projeto</p>
        {projeto && !trocando ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-800 flex-1 truncate">{projeto.rotulo}</span>
            {!grupo.confirmado && !semArquivo && (
              <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                sugerido
              </span>
            )}
            <button onClick={() => setTrocando(true)} className="text-xs text-indigo-600 hover:underline">
              trocar
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <input
              autoFocus
              className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
              placeholder="Buscar projeto por nome ou número…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            {resultados.length > 0 && (
              <ul className="border border-slate-200 rounded-md max-h-52 overflow-auto divide-y divide-slate-100">
                {resultados.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => {
                        setProjeto({ id: r.id, rotulo: `${r.numero} · ${r.nome}` })
                        setTrocando(false)
                        setBusca('')
                      }}
                      className="w-full text-left px-2.5 py-1.5 text-sm hover:bg-indigo-50"
                    >
                      <span className="text-slate-400 tabular-nums mr-1.5">{r.numero}</span>
                      {r.nome}
                      {r.status && <span className="text-[10px] text-slate-400 ml-1.5">{r.status}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {projeto && (
              <button onClick={() => setTrocando(false)} className="text-xs text-slate-500 hover:underline">
                manter {projeto.rotulo}
              </button>
            )}
          </div>
        )}
        {!semArquivo && !grupo.confirmado && (
          <p className="text-[11px] text-slate-400 mt-1.5">
            Ao lançar, a pasta “{grupo.chave}” fica ligada a este projeto para as próximas vezes.
          </p>
        )}
      </div>

      {/* Tarefas */}
      {projeto && (
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex-1">Tarefas</p>
            {!marcadas.length && (
              <label className="text-xs text-slate-500 flex items-center gap-1.5">
                Total
                <input
                  className="w-20 border border-slate-300 rounded-md px-2 py-1 text-sm text-right tabular-nums"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                />
                h
              </label>
            )}
          </div>
          {tarefas.length === 0 ? (
            <p className="text-xs text-slate-400">Este projeto não tem tarefas abertas. As horas entram no projeto.</p>
          ) : (
            <ul className="space-y-1 max-h-64 overflow-auto">
              {tarefas.map((t) => {
                const marcada = t.id in horasTarefa
                return (
                  <li key={t.id} className={`flex items-center gap-2 rounded-md px-2 py-1 ${marcada ? 'bg-indigo-50' : ''}`}>
                    <input type="checkbox" checked={marcada} onChange={() => alternarTarefa(t.id)} />
                    <span className={`text-sm flex-1 truncate ${t.parent_id ? 'pl-3 text-slate-600' : 'text-slate-800'}`}>
                      {t.codigo && <span className="text-slate-400 mr-1">{t.codigo}</span>}
                      {t.nome}
                    </span>
                    {t.minha && (
                      <span className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-1">sua</span>
                    )}
                    {t.status && <span className="text-[10px] text-slate-400 w-20 text-right">{t.status}</span>}
                    {marcada && (
                      <input
                        className="w-16 border border-slate-300 rounded-md px-1.5 py-0.5 text-sm text-right tabular-nums"
                        value={horasTarefa[t.id]}
                        onChange={(e) => setHorasTarefa((h) => ({ ...h, [t.id]: e.target.value }))}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {marcadas.length > 0 && (
            <p className="text-xs text-slate-500 mt-1.5 text-right">
              Total: <b className="tabular-nums">{fmtHoras(somaTarefas)}</b>
              <span className="text-slate-400"> · medido {fmtHoras(horasDe(grupo.ativo_seg))}</span>
            </p>
          )}
        </div>
      )}

      {/* Descrição */}
      <div>
        <textarea
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          rows={2}
          placeholder="O que foi feito? (mínimo 25 caracteres)"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
        <p className={`text-[11px] text-right ${descricao.trim().length < 25 ? 'text-slate-400' : 'text-emerald-600'}`}>
          {descricao.trim().length}/25
        </p>
      </div>

      {erro && <p className="text-xs text-red-600">{erro}</p>}
      <div className="flex justify-end">
        <button
          onClick={salvar}
          disabled={salvando}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-60"
        >
          {salvando ? 'Lançando…' : `Lançar ${fmtHoras(horasFinais)}`}
        </button>
      </div>
    </div>
  )
}
