import { useEffect, useMemo, useState } from 'react'
import jsPDF from 'jspdf'
import type { MesPremiado } from '../lib/funcionarioDoMes'
import {
  MESES,
  carregarAno,
  figurinha,
  iniciais,
  limparMes,
  pontosVemDoSistema,
  salvarMes,
} from '../lib/funcionarioDoMes'
import { usePermissoes } from '../lib/permissoes'
import { LOGO_BIM_FIRE_JPEG } from '../lib/logoBimFire'

/** Numero curto: 18,5 em vez de 18.50. */
function numeroBonito(v: number | null | undefined) {
  if (v === null || v === undefined) return ''
  return String(Math.round(v * 10) / 10).replace('.', ',')
}

/** Le um arquivo de imagem do site e devolve em base64, para entrar no PDF. */
async function comoDataUrl(caminho: string): Promise<string | null> {
  try {
    const r = await fetch(caminho)
    if (!r.ok) return null
    const blob = await r.blob()
    return await new Promise((resolve) => {
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result))
      fr.onerror = () => resolve(null)
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export default function FuncionarioDoMes({
  pontosDoMes,
}: {
  /** Ranking de pontos daquele mes, para sugerir o numero. */
  pontosDoMes: (ano: number, mes: number) => { responsavel: string; pontos: number }[]
}) {
  const { pode } = usePermissoes()
  const podeEditar = pode('equipe.editar')

  const [ano, setAno] = useState(new Date().getFullYear())
  const [lista, setLista] = useState<MesPremiado[]>([])
  const [carregando, setCarregando] = useState(true)
  const [editando, setEditando] = useState<number | null>(null)
  const [nome, setNome] = useState('')
  const [pontos, setPontos] = useState('')
  const [gerando, setGerando] = useState(false)

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    carregarAno(ano)
      .then((l) => {
        if (vivo) setLista(l)
      })
      .catch(() => {
        if (vivo) setLista([])
      })
      .finally(() => {
        if (vivo) setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [ano])

  const porMes = useMemo(() => {
    const m = new Map<number, MesPremiado>()
    for (const r of lista) m.set(r.mes, r)
    return m
  }, [lista])

  /** Nomes que ja aparecem no ano ou no ranking, para o campo sugerir. */
  const sugestoes = useMemo(() => {
    const nomes = new Set<string>()
    for (const r of lista) nomes.add(r.colaborador)
    for (let mes = 1; mes <= 12; mes++) {
      for (const r of pontosDoMes(ano, mes)) nomes.add(r.responsavel)
    }
    return Array.from(nomes).filter((n) => n && n !== 'Sem responsável').sort()
  }, [lista, ano, pontosDoMes])

  /** O que o sistema calculou para a pessoa naquele mes. */
  function pontosCalculados(mes: number, pessoa: string): number | null {
    if (!pessoa) return null
    if (!pontosVemDoSistema(ano, mes)) return null
    const alvo = pessoa.trim().toLowerCase()
    const achado = pontosDoMes(ano, mes).find(
      (r) => (r.responsavel || '').trim().toLowerCase() === alvo
    )
    return achado ? achado.pontos : null
  }

  /** O numero que aparece no quadro: o gravado, ou o do sistema. */
  function pontosDoQuadro(mes: number): number | null {
    const r = porMes.get(mes)
    if (!r) return null
    if (r.pontos !== null && r.pontos !== undefined) return Number(r.pontos)
    return pontosCalculados(mes, r.colaborador)
  }

  function abrirEdicao(mes: number) {
    if (!podeEditar) return
    const r = porMes.get(mes)
    setEditando(mes)
    setNome(r ? r.colaborador : '')
    setPontos(r && r.pontos !== null && r.pontos !== undefined ? String(r.pontos) : '')
  }

  async function salvar(mes: number) {
    const pessoa = nome.trim()
    if (!pessoa) {
      alert('Escolha quem foi o funcionario do mes.')
      return
    }
    const digitado = pontos.trim()
    const valor = digitado ? Number(digitado.replace(',', '.')) : null
    if (digitado && Number.isNaN(valor)) {
      alert('Pontos: use so numero, por exemplo 18,5.')
      return
    }
    try {
      await salvarMes({
        ano,
        mes,
        colaborador: pessoa,
        pontos: valor,
        pontosManual: valor !== null,
      })
      setEditando(null)
      setLista(await carregarAno(ano))
    } catch (e: any) {
      alert(e.message || 'Nao foi possivel salvar.')
    }
  }

  async function apagar(mes: number) {
    if (!confirm('Tirar o funcionario do mes de ' + MESES[mes - 1] + '?')) return
    try {
      await limparMes(ano, mes)
      setEditando(null)
      setLista(await carregarAno(ano))
    } catch (e: any) {
      alert(e.message || 'Nao foi possivel apagar.')
    }
  }

  /**
   * PDF no formato do quadro de parede: 12 quadradinhos, dois blocos de seis.
   * Sai em paisagem porque e assim que a folha e colada la.
   */
  async function gerarPdf() {
    setGerando(true)
    try {
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
      const larguraFolha = 297
      pdf.addImage(LOGO_BIM_FIRE_JPEG, 'JPEG', 14, 10, 18, 18)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(20)
      pdf.text('FUNCIONÁRIO DO MÊS', larguraFolha / 2, 20, { align: 'center' })
      pdf.setFontSize(12)
      pdf.setTextColor(110)
      pdf.text(String(ano), larguraFolha / 2, 27, { align: 'center' })
      pdf.setTextColor(0)

      const imagens = new Map<string, string | null>()
      for (let mes = 1; mes <= 12; mes++) {
        const r = porMes.get(mes)
        const caminho = r ? figurinha(r.colaborador) : null
        if (caminho && !imagens.has(caminho)) imagens.set(caminho, await comoDataUrl(caminho))
      }

      const margem = 14
      const colunas = 6
      const largura = (larguraFolha - margem * 2) / colunas
      const altura = 68
      const topo = 36

      for (let mes = 1; mes <= 12; mes++) {
        const linha = Math.floor((mes - 1) / colunas)
        const coluna = (mes - 1) % colunas
        const x = margem + coluna * largura
        const y = topo + linha * altura
        const r = porMes.get(mes)

        pdf.setDrawColor(210)
        pdf.roundedRect(x + 2, y, largura - 4, altura - 6, 2, 2)

        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(10)
        pdf.text(MESES[mes - 1], x + largura / 2, y + 8, { align: 'center' })

        const caminho = r ? figurinha(r.colaborador) : null
        const img = caminho ? imagens.get(caminho) : null
        if (img) {
          pdf.addImage(img, 'PNG', x + largura / 2 - 14, y + 12, 28, 28)
        } else if (r) {
          pdf.setDrawColor(150)
          pdf.circle(x + largura / 2, y + 26, 13)
          pdf.setFontSize(12)
          pdf.text(iniciais(r.colaborador), x + largura / 2, y + 28, { align: 'center' })
        }

        if (r) {
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(10)
          pdf.text(r.colaborador, x + largura / 2, y + 47, { align: 'center' })
          const p = pontosDoQuadro(mes)
          if (p !== null) {
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(14)
            pdf.text(numeroBonito(p), x + largura / 2, y + 57, { align: 'center' })
          }
        } else {
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(9)
          pdf.setTextColor(170)
          pdf.text('—', x + largura / 2, y + 30, { align: 'center' })
          pdf.setTextColor(0)
        }
      }

      pdf.save('funcionario-do-mes-' + ano + '.pdf')
    } finally {
      setGerando(false)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Funcionário do mês</h3>
        <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-1 py-0.5">
          <button onClick={() => setAno((a) => a - 1)} className="w-6 h-6 text-slate-500 hover:bg-slate-100 rounded">
            ‹
          </button>
          <span className="text-[11px] font-medium text-slate-700 px-1">{ano}</span>
          <button onClick={() => setAno((a) => a + 1)} className="w-6 h-6 text-slate-500 hover:bg-slate-100 rounded">
            ›
          </button>
        </div>
        <button
          onClick={gerarPdf}
          disabled={gerando}
          className="ml-auto px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs hover:bg-indigo-700 disabled:bg-slate-300"
        >
          {gerando ? 'Gerando...' : 'Gerar PDF para imprimir'}
        </button>
      </div>

      <p className="text-[11px] text-slate-500">
        Até julho de 2026 os pontos foram digitados, como vinham da planilha. De agosto em
        diante o número vem do ranking do mês, e você pode corrigir por cima.
      </p>

      {carregando ? (
        <p className="text-xs text-slate-400">Carregando...</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {MESES.map((rotulo, i) => {
            const mes = i + 1
            const r = porMes.get(mes)
            const p = pontosDoQuadro(mes)
            const img = r ? figurinha(r.colaborador) : null
            const emEdicao = editando === mes
            return (
              <div
                key={rotulo}
                className={
                  'border rounded-xl p-2 text-center ' +
                  (r ? 'border-slate-200 bg-slate-50/60' : 'border-dashed border-slate-200')
                }
              >
                <p className="text-[10px] font-semibold text-slate-500">{rotulo}</p>

                {emEdicao ? (
                  <div className="space-y-1 mt-1">
                    <input
                      list="equipe-funcionario-mes"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Quem ganhou"
                      className="w-full border border-slate-200 rounded px-1 py-1 text-[11px]"
                    />
                    <input
                      value={pontos}
                      onChange={(e) => setPontos(e.target.value)}
                      placeholder={
                        pontosCalculados(mes, nome) !== null
                          ? 'sistema: ' + numeroBonito(pontosCalculados(mes, nome))
                          : 'pontos'
                      }
                      className="w-full border border-slate-200 rounded px-1 py-1 text-[11px] text-center"
                    />
                    <div className="flex justify-center gap-2 pt-0.5">
                      <button onClick={() => salvar(mes)} className="text-[10px] text-emerald-700 font-medium hover:underline">
                        salvar
                      </button>
                      <button onClick={() => setEditando(null)} className="text-[10px] text-slate-500 hover:underline">
                        cancelar
                      </button>
                      {r && (
                        <button onClick={() => apagar(mes)} className="text-[10px] text-rose-600 hover:underline">
                          tirar
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => abrirEdicao(mes)}
                    disabled={!podeEditar}
                    className="w-full flex flex-col items-center gap-1 mt-1 disabled:cursor-default"
                  >
                    {img ? (
                      <img src={img} alt={r ? r.colaborador : ''} className="w-14 h-14 object-contain" />
                    ) : r ? (
                      <span className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-semibold">
                        {iniciais(r.colaborador)}
                      </span>
                    ) : (
                      <span className="w-14 h-14 rounded-full border border-dashed border-slate-300 flex items-center justify-center text-slate-300 text-lg">
                        +
                      </span>
                    )}
                    <span className="text-[11px] font-medium text-slate-700 leading-tight">
                      {r ? r.colaborador : 'sem indicação'}
                    </span>
                    {p !== null && (
                      <span className="text-sm font-bold text-slate-800">{numeroBonito(p)}</span>
                    )}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <datalist id="equipe-funcionario-mes">
        {sugestoes.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {!podeEditar && (
        <p className="text-[11px] text-slate-400">
          Só quem tem permissão de equipe pode mexer no quadro.
        </p>
      )}
    </div>
  )
}
