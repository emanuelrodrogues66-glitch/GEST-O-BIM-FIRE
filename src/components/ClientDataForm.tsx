import { CLIENT_FIELDS, CLIENT_FIELDS_OBRIGATORIOS, CLIENT_SECOES } from '../types'
import type { ClientField, ProjectClient } from '../types'

export default function ClientDataForm({
  value,
  onChange,
  showMissing,
}: {
  value: Partial<ProjectClient>
  onChange: (patch: Partial<ProjectClient>) => void
  showMissing: boolean
}) {
  const preenchidos = CLIENT_FIELDS_OBRIGATORIOS.filter((f) =>
    !!(value[f.key] || '').toString().trim()
  ).length
  const total = CLIENT_FIELDS_OBRIGATORIOS.length
  const completo = preenchidos === total

  function faltaNaSecao(secao: string): number {
    return CLIENT_FIELDS_OBRIGATORIOS.filter(
      (f) => f.secao === secao && !(value[f.key] || '').toString().trim()
    ).length
  }

  function renderCampo(f: ClientField) {
    const val = (value[f.key] as string) || ''
    const missing = showMissing && !f.opcional && !val.trim()
    const base = `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
      missing ? 'border-red-400 bg-red-50/40' : 'border-slate-300'
    }`

    return (
      <div key={f.key} className={f.largura === 'inteira' ? 'col-span-2' : ''}>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          {f.label}
          {f.opcional && <span className="text-slate-400 font-normal"> (opcional)</span>}
        </label>

        {f.tipo === 'simNao' ? (
          <select className={base} value={val} onChange={(e) => onChange({ [f.key]: e.target.value })}>
            <option value="">—</option>
            <option value="Sim">Sim</option>
            <option value="Não">Não</option>
          </select>
        ) : f.tipo === 'longo' ? (
          <textarea
            className={base}
            rows={3}
            value={val}
            placeholder={f.placeholder}
            onChange={(e) => onChange({ [f.key]: e.target.value })}
          />
        ) : (
          <div className="flex gap-1.5">
            <input
              type={f.tipo === 'data' ? 'date' : 'text'}
              className={base}
              value={val}
              placeholder={f.placeholder}
              onChange={(e) => onChange({ [f.key]: e.target.value })}
            />
            {f.tipo === 'url' && val.trim() && (
              <a
                href={val}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 px-2 flex items-center border border-slate-300 rounded-lg text-xs text-indigo-600 hover:bg-slate-50"
                title="Abrir localização"
              >
                abrir
              </a>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-4 gap-3">
        <p className="text-xs text-slate-500">
          Não é obrigatório preencher agora, mas o projeto só pode ser marcado como{' '}
          <span className="font-medium text-slate-700">Concluído</span> quando todos os campos estiverem
          preenchidos.
        </p>
        <span
          className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${
            completo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {preenchidos}/{total} preenchidos
        </span>
      </div>

      {/* Dispensa de anexos para memorial simplificado / TAC */}
      <label className="flex items-start gap-2 mb-4 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50/60 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={!!value.dispensa_upload}
          onChange={(e) => onChange({ dispensa_upload: e.target.checked })}
        />
        <span className="text-[11px] text-slate-600">
          <b className="text-slate-700">Memorial simplificado ou TAC</b> — dispensa o envio dos arquivos
          obrigatórios para concluir o projeto.
        </span>
      </label>

      <div className="space-y-5">
        {CLIENT_SECOES.map((secao) => {
          const campos = CLIENT_FIELDS.filter((f) => f.secao === secao)
          if (campos.length === 0) return null
          const falta = faltaNaSecao(secao)

          return (
            <div key={secao}>
              <div className="flex items-center gap-2 mb-2 pb-1 border-b border-slate-100">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{secao}</h4>
                {falta > 0 ? (
                  <span className="text-[10px] text-amber-600">faltam {falta}</span>
                ) : (
                  <span className="text-[10px] text-emerald-600">completo ✓</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">{campos.map(renderCampo)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
