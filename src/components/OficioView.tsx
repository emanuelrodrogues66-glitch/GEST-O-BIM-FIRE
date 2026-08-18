import { forwardRef } from 'react'
import type { Project, ProjectClient, ProjectCorrection, ProjectCorrectionItem } from '../types'
import {
  OFICIO_CIDADE_PADRAO,
  OFICIO_DESTINATARIO_PADRAO,
  OFICIO_RESPONSAVEL_CREA,
  OFICIO_RESPONSAVEL_TECNICO,
} from '../types'

function formatDateBR(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function dataPorExtenso(): string {
  const hoje = new Date()
  const meses = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ]
  return `${hoje.getDate()} de ${meses[hoje.getMonth()]} de ${hoje.getFullYear()}`
}

type Props = {
  project: Project
  client: Partial<ProjectClient>
  correction: ProjectCorrection
  items: ProjectCorrectionItem[]
}

const OficioView = forwardRef<HTMLDivElement, Props>(
  ({ project, client, correction, items }, ref) => {
    const processo = client.numero_processo?.trim() || '—'
    const re = client.numero_re?.trim()
    const docCliente = client.cnpj?.trim() || '—'
    const cidade = correction.cidade?.trim() || OFICIO_CIDADE_PADRAO
    const linhasDestinatario = (correction.destinatario?.trim() || OFICIO_DESTINATARIO_PADRAO)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    return (
      <div
        ref={ref}
        // Largura equivalente a uma folha A4 em ~96dpi, com margens de ofício.
        style={{ width: 794, padding: '56px 64px', boxSizing: 'border-box' }}
        className="bg-white text-slate-900"
      >
        {/* Cabeçalho */}
        <div className="text-center border-b-2 border-slate-800 pb-3 mb-6">
          <h1 className="text-lg font-bold uppercase tracking-wide">Ofício Resposta</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Atendimento às exigências — {correction.numero}ª correção
          </p>
        </div>

        {/* Local e data */}
        <p className="text-right text-[11px] mb-6">
          {cidade}, {dataPorExtenso()}.
        </p>

        {/* Destinatário */}
        <div className="text-[11px] mb-5 leading-relaxed">
          <p className="font-semibold">Ao</p>
          {linhasDestinatario.map((linha, i) => (
            <p key={i} className={i === 0 ? 'font-semibold' : ''}>
              {linha}
            </p>
          ))}
        </div>

        {/* Referência do processo */}
        <table className="w-full text-[11px] border-collapse mb-5">
          <tbody>
            <tr>
              <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 font-semibold w-40">
                Projeto
              </td>
              <td className="border border-slate-300 px-2 py-1.5">{project.nome}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 font-semibold">
                CNPJ / CPF
              </td>
              <td className="border border-slate-300 px-2 py-1.5">{docCliente}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 font-semibold">
                Nº do processo
              </td>
              <td className="border border-slate-300 px-2 py-1.5">
                {processo}
                {re ? `   ·   NIB/RE: ${re}` : ''}
              </td>
            </tr>
            {client.endereco_completo?.trim() && (
              <tr>
                <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 font-semibold">
                  Endereço
                </td>
                <td className="border border-slate-300 px-2 py-1.5">{client.endereco_completo}</td>
              </tr>
            )}
            {client.ocupacao?.trim() && (
              <tr>
                <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 font-semibold">
                  Ocupação
                </td>
                <td className="border border-slate-300 px-2 py-1.5">{client.ocupacao}</td>
              </tr>
            )}
            <tr>
              <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 font-semibold">
                Análise de
              </td>
              <td className="border border-slate-300 px-2 py-1.5">
                {formatDateBR(correction.data)}
                {correction.analista?.trim() ? `   ·   Analista: ${correction.analista}` : ''}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Texto de abertura */}
        <p className="text-[11px] text-justify leading-relaxed mb-5">
          Prezados Senhores, em atenção às exigências apontadas na análise do projeto acima referenciado,
          apresentamos a seguir, item a item, os esclarecimentos e as providências adotadas, permanecendo à
          disposição para quaisquer informações complementares que se façam necessárias.
        </p>

        {/* Itens e respostas */}
        <div className="space-y-3 mb-8">
          {items.map((item) => (
            <div key={item.id} className="border border-slate-300 break-inside-avoid">
              <div className="bg-slate-100 border-b border-slate-300 px-2 py-1.5">
                <p className="text-[11px] font-semibold">
                  Item {String(item.numero).padStart(2, '0')} — Exigência
                </p>
                <p className="text-[11px] mt-1 whitespace-pre-wrap text-justify leading-relaxed">
                  {item.exigencia || '—'}
                </p>
              </div>
              <div className="px-2 py-1.5">
                <p className="text-[11px] font-semibold">Resposta</p>
                <p className="text-[11px] mt-1 whitespace-pre-wrap text-justify leading-relaxed">
                  {item.resposta?.trim() || '—'}
                </p>
              </div>
            </div>
          ))}

          {items.length === 0 && (
            <p className="text-[11px] text-slate-400 italic">Nenhum item cadastrado nesta correção.</p>
          )}
        </div>

        {correction.observacoes?.trim() && (
          <div className="mb-8">
            <p className="text-[11px] font-semibold mb-1">Considerações finais</p>
            <p className="text-[11px] whitespace-pre-wrap text-justify leading-relaxed">
              {correction.observacoes}
            </p>
          </div>
        )}

        {/* Fecho */}
        <p className="text-[11px] mb-10">Sendo o que se apresenta para o momento, subscrevemo-nos.</p>
        <p className="text-[11px] mb-12">Atenciosamente,</p>

        {/* Assinatura: responsável técnico fixo da BIM Fire */}
        <div className="text-center text-[11px] mt-4">
          <div className="border-t border-slate-800 w-72 mx-auto pt-1">
            <p className="font-semibold">{OFICIO_RESPONSAVEL_TECNICO}</p>
            <p className="text-slate-600">Responsável Técnico</p>
            <p className="text-slate-600">{OFICIO_RESPONSAVEL_CREA}</p>
          </div>
        </div>
      </div>
    )
  }
)

OficioView.displayName = 'OficioView'

export default OficioView
