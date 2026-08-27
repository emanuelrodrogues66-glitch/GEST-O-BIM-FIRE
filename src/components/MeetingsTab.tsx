import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ProjectMeeting } from '../lib/reunioes'
import { ataPendente, carregarReunioesDoProjeto } from '../lib/reunioes'
import { corDoResponsavel } from '../lib/agenda'
import { faixaHoraria, horaCurta } from '../types'
import SeletorDeResponsaveis from './SeletorDeResponsaveis'

function hojeStr() {
  return new Date().toISOString().slice(0, 10)
}

function formatarData(d: string) {
  const [a, m, dia] = d.split('-')
  return `${dia}/${m}/${a}`
}

/**
 * Reuniões do projeto.
 *
 * A ata mora junto do compromisso de propósito: reunião sem registro do que
 * ficou combinado vira discussão de memória três semanas depois.
 */
export default function MeetingsTab({
  projectId,
  equipe,
}: {
  projectId: string
  equipe: string[]
}) {
  const [reunioes, setReunioes] = useState<ProjectMeeting[]>([])
  const [carregando, setCarregando] = useState(true)
  const [abertaId, setAbertaId] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)

  useEffect(() => {
    recarregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function recarregar() {
    setCarregando(true)
    setReunioes(await carregarReunioesDoProjeto(projectId))
    setCarregando(false)
  }

  async function criar(dados: Partial<ProjectMeeting>) {
    const { data, error } = await supabase
      .from('project_meetings')
      .insert({ ...dados, project_id: projectId })
      .select('id')
      .single()
    if (error) {
      alert(error.message)
      return
    }
    setCriando(false)
    await recarregar()
    // Abre a recém-criada: quase sempre a pessoa já quer escrever a ata.
    if (data) setAbertaId((data as any).id)
  }

  async function atualizar(id: string, patch: Partial<ProjectMeeting>) {
    setReunioes((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    const { error } = await supabase.from('project_meetings').update(patch).eq('id', id)
    if (error) {
      alert(error.message)
      recarregar()
    }
  }

  async function excluir(r: ProjectMeeting) {
    if (!confirm(`Apagar a reunião "${r.titulo}" e a ata dela?`)) return
    await supabase.from('project_meetings').delete().eq('id', r.id)
    recarregar()
  }

  if (carregando) return <p className="text-xs text-slate-400 py-4">Carregando reuniões...</p>

  const pendentes = reunioes.filter((r) => ataPendente(r)).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-slate-800">Reuniões</h4>
        {pendentes > 0 && (
          <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
            {pendentes} sem ata
          </span>
        )}
        <button
          onClick={() => setCriando(true)}
          className="ml-auto text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          + Nova reunião
        </button>
      </div>

      <p className="text-[10px] text-slate-400">
        Toda reunião marcada aqui aparece no calendário da aba Tarefas e agenda, junto com o resto
        do dia.
      </p>

      {criando && (
        <FormularioReuniao
          equipe={equipe}
          onSalvar={criar}
          onCancelar={() => setCriando(false)}
        />
      )}

      {reunioes.length === 0 && !criando && (
        <p className="text-xs text-slate-400 py-3">Nenhuma reunião registrada neste projeto.</p>
      )}

      <div className="space-y-2">
        {reunioes.map((r) => {
          const aberta = abertaId === r.id
          const semAta = ataPendente(r)
          return (
            <div
              key={r.id}
              className={`border rounded-lg ${
                semAta ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'
              }`}
            >
              <button
                onClick={() => setAbertaId(aberta ? null : r.id)}
                className="w-full text-left px-3 py-2 flex flex-wrap items-center gap-2"
              >
                <span className="text-sm">📅</span>
                <span className="text-xs font-medium text-slate-800">{r.titulo}</span>
                <span className="text-[11px] text-slate-500 tabular-nums">
                  {formatarData(r.data)}
                  {r.hora_inicio && ` · ${faixaHoraria(r.hora_inicio, r.hora_fim)}`}
                </span>
                {r.local && <span className="text-[10px] text-slate-400 truncate">{r.local}</span>}

                <span className="flex items-center gap-1 ml-auto">
                  {r.participantes.slice(0, 5).map((p) => (
                    <span
                      key={p}
                      title={p}
                      className="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
                      style={{ background: corDoResponsavel(p) }}
                    >
                      {p.charAt(0).toUpperCase()}
                    </span>
                  ))}
                  {semAta && <span className="text-[10px] text-amber-700 font-medium">sem ata</span>}
                  <span className="text-slate-300 ml-1">{aberta ? '▾' : '▸'}</span>
                </span>
              </button>

              {aberta && (
                <div className="px-3 pb-3 space-y-2 border-t border-slate-200 pt-2">
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">
                      Ata — o que foi discutido
                    </label>
                    <textarea
                      defaultValue={r.ata || ''}
                      onBlur={(e) => atualizar(r.id, { ata: e.target.value.trim() || null })}
                      rows={6}
                      placeholder="Quem participou, o que foi tratado, o que ficou decidido..."
                      className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs resize-y"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">
                      Encaminhamentos
                    </label>
                    <textarea
                      defaultValue={r.encaminhamentos || ''}
                      onBlur={(e) =>
                        atualizar(r.id, { encaminhamentos: e.target.value.trim() || null })
                      }
                      rows={3}
                      placeholder="O que cada um ficou de fazer, e até quando"
                      className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs resize-y"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      <input
                        type="checkbox"
                        checked={r.realizada}
                        onChange={(e) => atualizar(r.id, { realizada: e.target.checked })}
                      />
                      Reunião realizada
                    </label>
                    <span className="text-[10px] text-slate-400">
                      {r.participantes.length > 0
                        ? `Participantes: ${r.participantes.join(', ')}`
                        : 'Sem participantes marcados'}
                    </span>
                    <button
                      onClick={() => excluir(r)}
                      className="ml-auto text-[10px] text-slate-400 hover:text-red-600"
                    >
                      Apagar reunião
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FormularioReuniao({
  equipe,
  onSalvar,
  onCancelar,
}: {
  equipe: string[]
  onSalvar: (dados: Partial<ProjectMeeting>) => void
  onCancelar: () => void
}) {
  const [titulo, setTitulo] = useState('')
  const [data, setData] = useState(hojeStr())
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFim, setHoraFim] = useState('')
  const [local, setLocal] = useState('')
  const [participantes, setParticipantes] = useState<string[]>([])

  return (
    <div className="border border-indigo-300 bg-indigo-50/50 rounded-lg p-3 space-y-2">
      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Assunto da reunião"
        autoFocus
        className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="border border-slate-300 rounded-md px-2 py-1.5 text-xs"
        />
        <label className="flex items-center gap-1 text-[10px] text-slate-500">
          das
          <input
            type="time"
            value={horaInicio}
            onChange={(e) => setHoraInicio(e.target.value)}
            className="border border-slate-300 rounded-md px-1.5 py-1.5 text-xs"
          />
          às
          <input
            type="time"
            value={horaFim}
            onChange={(e) => setHoraFim(e.target.value)}
            className="border border-slate-300 rounded-md px-1.5 py-1.5 text-xs"
          />
        </label>
        <input
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder="Local ou link"
          className="flex-1 min-w-[140px] border border-slate-300 rounded-md px-2 py-1.5 text-xs"
        />
      </div>

      <SeletorDeResponsaveis
        titulo="Participantes"
        opcoes={equipe}
        selecionados={participantes}
        onChange={setParticipantes}
      />

      <div className="flex justify-end gap-2">
        <button onClick={onCancelar} className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-200 rounded-md">
          Cancelar
        </button>
        <button
          onClick={() =>
            onSalvar({
              titulo: titulo.trim(),
              data,
              hora_inicio: horaInicio || null,
              hora_fim: horaFim || null,
              local: local.trim() || null,
              participantes,
            })
          }
          disabled={!titulo.trim()}
          className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md font-medium"
        >
          Marcar reunião
        </button>
      </div>

      <p className="text-[10px] text-slate-400">
        A ata você escreve depois, abrindo a reunião na lista. {horaCurta(null)}
      </p>
    </div>
  )
}
