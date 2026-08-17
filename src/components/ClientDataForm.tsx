import { CLIENT_FIELDS } from '../types'
import type { ProjectClient } from '../types'

export default function ClientDataForm({
  value,
  onChange,
  showMissing,
}: {
  value: Partial<ProjectClient>
  onChange: (patch: Partial<ProjectClient>) => void
  showMissing: boolean
}) {
  const preenchidos = CLIENT_FIELDS.filter((f) => !!(value[f.key] || '').toString().trim()).length

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-500">
          Não é obrigatório preencher agora, mas o projeto só pode ser marcado como{' '}
          <span className="font-medium text-slate-700">Concluído</span> quando todos os campos abaixo estiverem
          preenchidos.
        </p>
        <span
          className={`shrink-0 ml-3 text-[11px] font-medium px-2 py-0.5 rounded-full ${
            preenchidos === CLIENT_FIELDS.length
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-slate-100 text-slate-500'
          }`}
        >
          {preenchidos}/{CLIENT_FIELDS.length} preenchidos
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {CLIENT_FIELDS.map((f) => {
          const val = (value[f.key] as string) || ''
          const missing = showMissing && !val.trim()
          return (
            <div key={f.key}>
              <label className="block text-xs font-medium text-slate-500 mb-1">{f.label}</label>
              <input
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                  missing ? 'border-red-400 bg-red-50/40' : 'border-slate-300'
                }`}
                value={val}
                placeholder={f.placeholder}
                onChange={(e) => onChange({ [f.key]: e.target.value })}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
