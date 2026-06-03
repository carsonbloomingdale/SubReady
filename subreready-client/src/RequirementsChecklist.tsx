import type { RequirementRow } from './api'
import { isUploadableDocType } from './types'

interface RequirementsChecklistProps {
  requirements: RequirementRow[]
  emphasis?: string
  scoringProfile?: string
}

const TIER_STYLE: Record<string, string> = {
  required: 'bg-red-50 text-red-700 border-red-100',
  conditional: 'bg-amber-50 text-amber-800 border-amber-100',
  optional: 'bg-gray-50 text-gray-600 border-gray-100',
}

function TierBadge({ tier }: { tier: string }) {
  return (
    <span
      className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${TIER_STYLE[tier] ?? TIER_STYLE.optional}`}
    >
      {tier}
    </span>
  )
}

export default function RequirementsChecklist({
  requirements,
  emphasis,
  scoringProfile,
}: RequirementsChecklistProps) {
  const required = requirements.filter((r) => r.tier === 'required')
  const conditional = requirements.filter((r) => r.tier === 'conditional')
  const optional = requirements.filter((r) => r.tier === 'optional')

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-[#f0faf6] border-b border-[#d4ede4]">
        <p className="text-xs font-semibold text-[#1a7a5c] uppercase tracking-wide">
          Adaptive checklist
        </p>
        {emphasis && <p className="text-xs text-gray-600 mt-1 leading-snug">{emphasis}</p>}
        {scoringProfile && (
          <p className="text-[10px] text-gray-400 mt-1">Scoring profile: {scoringProfile}</p>
        )}
      </div>

      <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
        {[...required, ...conditional, ...optional].map((req) => (
          <div key={req.docType} className="px-4 py-2.5 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-gray-800">{req.label}</p>
              {!isUploadableDocType(req.docType) && (
                <p className="text-[10px] text-gray-400 mt-0.5">Verify offline · not scanned in app</p>
              )}
            </div>
            <TierBadge tier={req.tier} />
          </div>
        ))}
      </div>

      <p className="px-4 py-2 text-[10px] text-gray-400 border-t border-gray-100">
        {required.length} required · {conditional.length} conditional · {optional.length} optional
      </p>
    </div>
  )
}
