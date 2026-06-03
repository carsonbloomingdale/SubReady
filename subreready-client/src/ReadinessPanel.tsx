import type { ReadinessResult, RequirementRow } from './api'

interface ReadinessPanelProps {
  readiness: ReadinessResult | null
  loading?: boolean
  error?: string | null
  requirements?: RequirementRow[]
}

const CATEGORY_LABELS: Record<string, string> = {
  documentationCompleteness: 'Documentation',
  documentValidity: 'Validity',
  operationalReliability: 'Operational',
  regulatoryAlignment: 'Regulatory',
  auditIntegrity: 'Audit trail',
}

function scoreColor(score: number): string {
  if (score >= 90) return 'text-green-700'
  if (score >= 75) return 'text-amber-700'
  if (score >= 50) return 'text-orange-700'
  return 'text-red-600'
}

function barColor(score: number): string {
  if (score >= 90) return 'bg-green-500'
  if (score >= 75) return 'bg-amber-500'
  if (score >= 50) return 'bg-orange-500'
  return 'bg-red-500'
}

export default function ReadinessPanel({
  readiness,
  loading,
  error,
  requirements = [],
}: ReadinessPanelProps) {
  if (loading) {
    return (
      <div className="mt-4 p-4 rounded-xl border border-gray-200 bg-gray-50 animate-pulse">
        <p className="text-sm text-gray-500">Calculating mobilization readiness…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mt-4 p-3 rounded-xl border border-red-100 bg-red-50">
        <p className="text-xs text-red-600">{error}</p>
      </div>
    )
  }

  if (!readiness) return null

  const missing = requirements.filter((r) => r.status === 'missing' && r.tier === 'required')

  return (
    <div className="mt-4 rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Mobilization readiness
          </p>
          <p className={`text-2xl font-bold tabular-nums ${scoreColor(readiness.overallScore)}`}>
            {readiness.overallScore}
          </p>
        </div>
        <p className={`text-sm font-medium mt-0.5 ${scoreColor(readiness.overallScore)}`}>
          {readiness.classification.label}
        </p>
        {readiness.mobilizationReady && (
          <p className="text-xs text-green-700 mt-1 font-medium">Ready for GC approval</p>
        )}
      </div>

      <div className="px-4 py-3 space-y-2">
        {Object.entries(readiness.categories).map(([key, cat]) => (
          <div key={key}>
            <div className="flex justify-between text-xs mb-0.5">
              <span className="text-gray-600">{CATEGORY_LABELS[key] ?? key}</span>
              <span className="text-gray-800 font-medium tabular-nums">
                {Math.round(cat.weightedContribution * 10) / 10} pts
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor(cat.score * 100)}`}
                style={{ width: `${Math.min(100, cat.score * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {missing.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-100 bg-amber-50/50">
          <p className="text-xs text-amber-800 font-medium">Project checklist</p>
          <p className="text-xs text-amber-700 mt-0.5">
            {missing.map((m) => m.label).join(' · ')}
          </p>
          <p className="text-[10px] text-amber-600 mt-1">
            Score reflects uploaded COI + W-9; other items shown for full job requirements.
          </p>
        </div>
      )}

      {readiness.blocking.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-100">
          <p className="text-xs text-red-600">
            Blocking: {readiness.blocking.join(', ')}
          </p>
        </div>
      )}

      {readiness.warnings.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-100">
          {readiness.warnings.map((w) => (
            <p key={w} className="text-xs text-gray-500">
              {w}
            </p>
          ))}
        </div>
      )}

      <p className="px-4 py-2 text-[10px] text-gray-400 border-t border-gray-100">
        {readiness.disclaimer ?? 'Operational triage only — not legal verification.'}
      </p>
    </div>
  )
}
