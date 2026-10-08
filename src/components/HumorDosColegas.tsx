import { useEffect, useState } from 'react'
import type { ColegaParaVotar, MeuResumo } from '../lib/humorColegas'
import { colegasDoDia, meuResumo, votarNoColega } from '../lib/humorColegas'
import { HUMORES } from './MoodView'

/**
 * Como voce acha que seus colegas estao hoje.
 *
 * Aparece logo depois da batida, que e o unico momento em que se tem certeza
 * de que a pessoa esta olhando a tela. Responder e opcional: colega nenhum e
 * obrigado a opinar sobre o outro.
 *
 * Quem votou no que nao aparece para ninguem — nem para a pessoa avaliada,
 * nem para o ADM. O que se ve e sempre a media, e so a partir de dois votos:
 * com um voto so, a opiniao de uma pessoa se disfarcaria de \"a equipe acha\".
 */
export default function HumorDosColegas({
  colaborador,
  pin,
}: {
  colaborador: string
  pin: string
}) {
  const [colegas, setColegas] = useState<ColegaParaVotar[]>([])
  const [resumo, setResumo] = useState<MeuResumo | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState<string | null>(null)

  async function carregar() {
    try {
      const [c, r] = await Promise.all([
        colegasDoDia(colaborador, pin),
        meuResumo(colaborador, pin).catch(() => null),
      ])
      setColegas(c)
      setResumo(r)
      setErro('')
    } catch (e: any) {
      setErro(e.message || 'Não foi possível carregar.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    if (!colaborador || !pin) {
      setCarregando(false)
      return
    }
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colaborador, pin])

  async function votar(colega: string, valor: string) {
    const h = HUMORES.find((x) => x.valor === valor)
    if (!h) return
    setSalvando(colega)
    try {
      await votarNoColega({ colaborador, pin, colega, humor: valor, nota: h.nota })
      setColegas((prev) =>
        prev.map((c) => (c.colega === colega ? { ...c, ja_votei: true, humor: valor, nota: h.nota } : c))
      )
    } catch (e: any) {
      alert(e.message || 'Não foi possível registrar.')
    } finally {
      setSalvando(null)
    }
  }

  if (carregando) return null
  if (erro) return <p className="text-[11px] text-rose-600">{erro}</p>

  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
      <div>
        <p className="text-xs font-semibold text-slate-700">Como você acha que eles estão hoje?</p>
        <p className="text-[11px] text-slate-500">
          Opcional, e ninguém fica sabendo quem respondeu o quê — nem a pessoa, nem o ADM. Serve
          para a gente perceber quando alguém não está bem e não disse.
        </p>
      </div>

      {colegas.length === 0 ? (
        <p className="text-[11px] text-slate-400">Ninguém mais bateu ponto hoje ainda.</p>
      ) : (
        <div className="space-y-2">
          {colegas.map((c) => (
            <div key={c.colega} className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-700 font-medium min-w-[6rem]">{c.colega}</span>
              <div className="flex gap-1">
                {HUMORES.map((h) => (
                  <button
                    key={h.valor}
                    onClick={() => votar(c.colega, h.valor)}
                    disabled={salvando === c.colega}
                    title={h.rotulo}
                    className={
                      'w-8 h-8 rounded-lg border text-base transition ' +
                      (c.humor === h.valor
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 hover:bg-slate-50')
                    }
                  >
                    {h.emoji}
                  </button>
                ))}
              </div>
              {c.ja_votei && <span className="text-[10px] text-emerald-600">registrado</span>}
            </div>
          ))}
        </div>
      )}

      {resumo && resumo.mostra && (
        <p className="text-[11px] text-slate-600 border-t border-slate-100 pt-2">
          {resumo.votos} colega(s) responderam sobre você hoje. A média deles é {resumo.media} de 5.
        </p>
      )}
      {resumo && !resumo.mostra && resumo.votos > 0 && (
        <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-2">
          Ainda não dá para mostrar como os colegas te veem hoje: a média só aparece com dois ou
          mais respostas.
        </p>
      )}
    </div>
  )
}
