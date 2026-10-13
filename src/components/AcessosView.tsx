import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '../lib/supabase'

type Resumo = {
  user_id: string
  email: string
  nome: string | null
  acessos: number
  dias_distintos: number
  primeiro: string | null
  ultimo: string | null
  ultimo_login_auth: string | null
}

type Recente = { quando: string; email: string | null; nome: string | null; dispositivo: string | null }

function quandoBonito(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}
function diaCurto(iso: string) {
  const [, m, d] = iso.slice(0, 10).split('-')
  return d + '/' + m
}
function diasDesde(iso: string | null) {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}
/** "Chrome no Windows", sem a sopa de letras do user agent. */
function aparelho(ua: string | null) {
  if (!ua) return ''
  const nav = /Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'navegador'
  const so = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : ''
  return so ? nav + ' no ' + so : nav
}

/**
 * Quem entra no sistema, quando e com que frequencia.
 *
 * O Supabase guarda so o ultimo login de cada conta; o ritmo de uso — quem
 * entra todo dia, quem sumiu, a que horas a equipe trabalha — exige registrar
 * cada abertura. Aqui nao fica nada do que a pessoa fez dentro: so que entrou.
 */
export default function AcessosView() {
  const [dias, setDias] = useState(30)
  const [resumo, setResumo] = useState<Resumo[]>([])
  const [recentes, setRecentes] = useState<Recente[]>([])
  const [porDia, setPorDia] = useState<{ dia: string; nome: string; acessos: number }[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    Promise.all([
      supabase.rpc('acessos_resumo', { p_dias: dias }),
      supabase.rpc('acessos_recentes', { p_limite: 200 }),
      supabase.rpc('acessos_por_dia', { p_dias: dias }),
    ])
      .then(([r, u, d]) => {
        if (!vivo) return
        setResumo((r.data as Resumo[]) || [])
        setRecentes((u.data as Recente[]) || [])
        setPorDia((d.data as { dia: string; nome: string; acessos: number }[]) || [])
      })
      .finally(() => vivo && setCarregando(false))
    return () => {
      vivo = false
    }
  }, [dias])

  const grafico = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const d of porDia) mapa.set(d.dia, (mapa.get(d.dia) || 0) + Number(d.acessos))
    return Array.from(mapa.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dia, acessos]) => ({ dia: diaCurto(dia), acessos }))
  }, [porDia])

  /** Em que horas do dia o sistema e usado. */
  const porHora = useMemo(() => {
    const horas = new Array(24).fill(0)
    for (const r of recentes) horas[new Date(r.quando).getHours()] += 1
    return horas.map((acessos, h) => ({ hora: String(h).padStart(2, '0') + 'h', acessos }))
  }, [recentes])

  if (carregando) return <p className="text-sm text-slate-400 text-center py-10">Carregando acessos...</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Acessos ao sistema</h3>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={
                'text-[11px] px-2 py-1 rounded-lg border ' +
                (dias === d
                  ? 'border-indigo-600 text-indigo-700 bg-indigo-50'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50')
              }
            >
              {d} dias
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-slate-400">
            <tr className="text-left">
              <th className="px-2 py-1">Pessoa</th>
              <th className="px-2 py-1 text-right">Acessos</th>
              <th className="px-2 py-1 text-right">Dias com acesso</th>
              <th className="px-2 py-1">Último acesso</th>
              <th className="px-2 py-1">Último login</th>
            </tr>
          </thead>
          <tbody>
            {resumo.map((r) => {
              const sumido = diasDesde(r.ultimo || r.ultimo_login_auth)
              return (
                <tr key={r.user_id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5">
                    <span className="font-medium text-slate-700">{r.nome || '—'}</span>
                    <span className="text-slate-400"> · {r.email}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold text-slate-800">{r.acessos}</td>
                  <td className="px-2 py-1.5 text-right text-slate-600">{r.dias_distintos}</td>
                  <td className="px-2 py-1.5 text-slate-600">
                    {quandoBonito(r.ultimo)}
                    {sumido !== null && sumido > 7 && (
                      <span className="ml-1 text-amber-700">há {sumido} dias</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-slate-400">{quandoBonito(r.ultimo_login_auth)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="text-[10px] text-slate-400 mt-2">
          Uma abertura por hora é contada como um acesso — recarregar a página não infla o número.
          O registro começou agora; a coluna &quot;último login&quot; vem do histórico antigo do
          sistema de contas.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
          <h4 className="text-xs font-semibold text-slate-700 mb-2">Acessos por dia</h4>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={grafico} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="acessos" fill="#4f46e5" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
          <h4 className="text-xs font-semibold text-slate-700 mb-2">Em que horas o sistema é usado</h4>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porHora} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="hora" tick={{ fontSize: 9 }} interval={2} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="acessos" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
        <h4 className="text-xs font-semibold text-slate-700 mb-2">Últimos acessos</h4>
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {recentes.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-[11px] border-b border-slate-100 pb-1">
              <span className="text-slate-500 w-32">{quandoBonito(r.quando)}</span>
              <span className="font-medium text-slate-700">{r.nome || r.email}</span>
              <span className="text-slate-400 ml-auto">{aparelho(r.dispositivo)}</span>
            </div>
          ))}
          {recentes.length === 0 && (
            <p className="text-[11px] text-slate-400">
              Nenhum acesso registrado ainda. Eles aparecem conforme a equipe for abrindo o sistema.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
