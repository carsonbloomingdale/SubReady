export type DocType = 'coi' | 'w9'

export type DocStatus = 'pending' | 'reviewing' | 'ready' | 'review' | 'issue'

export interface TriageResult {
  status: 'green' | 'amber' | 'red'
  reason: string
  nextStep: string
}

export interface DocumentSlot {
  id: DocType
  label: string
  status: DocStatus
  fileName?: string
  triage?: TriageResult
}

export const DOC_SLOTS: DocumentSlot[] = [
  { id: 'coi', label: 'Certificate of Insurance', status: 'pending' },
  { id: 'w9', label: 'W-9', status: 'pending' },
]

export function triageToDocStatus(triage: TriageResult['status']): DocStatus {
  if (triage === 'green') return 'ready'
  if (triage === 'amber') return 'review'
  return 'issue'
}

export function detectDocType(text: string, fileName: string): DocType | null {
  const haystack = `${fileName} ${text}`.toLowerCase()

  if (
    haystack.includes('certificate of insurance') ||
    haystack.includes('general liability') ||
    /\bcoi\b/.test(haystack)
  ) {
    return 'coi'
  }
  if (
    haystack.includes('w-9') ||
    haystack.includes('w9') ||
    haystack.includes('form w-9') ||
    haystack.includes('request for taxpayer') ||
    haystack.includes('taxpayer identification')
  ) {
    return 'w9'
  }
  return null
}
