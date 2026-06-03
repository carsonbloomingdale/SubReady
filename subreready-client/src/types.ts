import type { RequirementRow } from './api'

export type DocType = 'coi' | 'w9' | 'business_registration'

export const UPLOADABLE_DOC_TYPES: DocType[] = ['coi', 'w9', 'business_registration']

export type DocStatus = 'pending' | 'reviewing' | 'ready' | 'review' | 'issue'

export interface TriageResult {
  status: 'green' | 'amber' | 'red'
  reason: string
  nextStep: string
  docType?: string
  inferredDocType?: string
  deterministicStatus?: string
  validityState?: string
  expirationDate?: string | null
  flags?: string[]
  matchScore?: number
  expiryScore?: number
  slotMismatch?: string
  extracted?: Record<string, unknown>
  llmWarning?: string
}

export interface DocumentSlot {
  id: DocType
  label: string
  status: DocStatus
  tier: string
  fileName?: string
  triage?: TriageResult
}

export function isUploadableDocType(docType: string): docType is DocType {
  return (UPLOADABLE_DOC_TYPES as readonly string[]).includes(docType)
}

export function documentSlotsFromRequirements(requirements: RequirementRow[]): DocumentSlot[] {
  return requirements
    .filter((r) => isUploadableDocType(r.docType))
    .filter((r) => r.tier === 'required' || r.tier === 'conditional')
    .map((r) => ({
      id: r.docType as DocType,
      label: r.label,
      status: 'pending' as const,
      tier: r.tier,
    }))
}

export function triageToDocStatus(triage: TriageResult['status']): DocStatus {
  if (triage === 'green') return 'ready'
  if (triage === 'amber') return 'review'
  return 'issue'
}

export function detectDocType(text: string, fileName: string): DocType | null {
  const haystack = `${fileName} ${text}`.toLowerCase()

  if (
    haystack.includes('certificate of insurance') ||
    haystack.includes('certificate of liability') ||
    haystack.includes('general liability') ||
    haystack.includes('acord') ||
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
  if (
    haystack.includes('articles of organization') ||
    haystack.includes('certificate of incorporation') ||
    haystack.includes('business registration') ||
    haystack.includes('dba')
  ) {
    return 'business_registration'
  }
  return null
}
