import type { DocumentSlot, DocStatus, TriageResult } from './types'

interface DocumentListProps {
  documents: DocumentSlot[]
}

const STATUS_CONFIG: Record<
  DocStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  pending: { label: 'Pending', bg: 'bg-gray-100', text: 'text-gray-500', dot: 'border-gray-300' },
  reviewing: { label: 'Reviewing', bg: 'bg-blue-50', text: 'text-blue-600', dot: 'border-blue-400 border-t-blue-400 animate-spin' },
  ready: { label: 'Ready', bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500 border-green-500' },
  review: { label: 'Review', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500 border-amber-500' },
  issue: { label: 'Issue', bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500 border-red-500' },
}

const VALIDITY_LABELS: Record<string, string> = {
  active: 'Active',
  expired: 'Expired',
  expiring_soon: 'Expiring soon',
  unknown: 'Unknown',
}

function formatFlag(flag: string): string {
  return flag.replace(/_/g, ' ')
}

function StatusBadge({ status }: { status: DocStatus }) {
  const cfg = STATUS_CONFIG[status]
  const isPending = status === 'pending'
  const isReviewing = status === 'reviewing'

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}
    >
      <span
        className={`w-2 h-2 rounded-full border ${
          isPending
            ? 'border-gray-300 bg-transparent'
            : isReviewing
              ? 'border-2 border-blue-400 border-t-transparent'
              : `${cfg.dot} border-0`
        }`}
      />
      {cfg.label}
    </span>
  )
}

function DocIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const TRIAGE_DETAIL_CONFIG: Record<
  Exclude<DocStatus, 'pending' | 'reviewing'>,
  { panel: string; nextStep: string }
> = {
  ready: { panel: 'bg-green-50 border-green-100', nextStep: 'text-green-800' },
  review: { panel: 'bg-amber-50 border-amber-100', nextStep: 'text-amber-800' },
  issue: { panel: 'bg-red-50 border-red-100', nextStep: 'text-red-700' },
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-[11px]">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-700 text-right font-medium">{value}</span>
    </div>
  )
}

function TriageDetail({ status, triage }: { status: DocStatus; triage: TriageResult }) {
  if (status === 'pending' || status === 'reviewing') return null

  const cfg = TRIAGE_DETAIL_CONFIG[status]
  const hasMeta =
    triage.validityState ||
    triage.expirationDate ||
    triage.matchScore != null ||
    triage.expiryScore != null ||
    (triage.flags && triage.flags.length > 0)

  return (
    <div className={`mt-2 rounded-lg border px-2.5 py-2 ${cfg.panel}`}>
      <p className="text-xs text-gray-600 leading-snug">{triage.reason}</p>
      <p className={`text-xs font-medium mt-1 leading-snug ${cfg.nextStep}`}>{triage.nextStep}</p>

      {triage.slotMismatch && (
        <p className="text-[11px] text-amber-800 mt-2 leading-snug">{triage.slotMismatch}</p>
      )}

      {hasMeta && (
        <div className="mt-2 pt-2 border-t border-black/5 space-y-1">
          {triage.validityState && (
            <MetaRow
              label="Validity"
              value={VALIDITY_LABELS[triage.validityState] ?? triage.validityState}
            />
          )}
          {triage.expirationDate && (
            <MetaRow label="Expires" value={triage.expirationDate} />
          )}
          {triage.matchScore != null && (
            <MetaRow label="Type match" value={`${Math.round(triage.matchScore * 100)}%`} />
          )}
          {triage.expiryScore != null && (
            <MetaRow label="Date clarity" value={`${Math.round(triage.expiryScore * 100)}%`} />
          )}
        </div>
      )}

      {triage.flags && triage.flags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {triage.flags.map((flag) => (
            <span
              key={flag}
              className="text-[10px] px-1.5 py-0.5 rounded bg-white/70 text-gray-600 border border-black/5"
            >
              {formatFlag(flag)}
            </span>
          ))}
        </div>
      )}

      {triage.llmWarning && (
        <p className="text-[10px] text-gray-500 mt-2 italic">{triage.llmWarning}</p>
      )}
    </div>
  )
}

export default function DocumentList({ documents }: DocumentListProps) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {documents.map((doc, i) => (
        <div
          key={doc.id}
          className={`flex items-start justify-between gap-3 px-4 py-3.5 ${
            i < documents.length - 1 ? 'border-b border-gray-100' : ''
          }`}
        >
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <DocIcon />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-800 truncate">{doc.label}</p>
              {doc.fileName && (
                <p className="text-xs text-gray-400 truncate">{doc.fileName}</p>
              )}
              {doc.triage && <TriageDetail status={doc.status} triage={doc.triage} />}
            </div>
          </div>
          <StatusBadge status={doc.status} />
        </div>
      ))}
    </div>
  )
}
