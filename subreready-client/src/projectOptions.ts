export const PROJECT_TYPES = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'public_infrastructure', label: 'Public infrastructure' },
  { value: 'institutional', label: 'Institutional' },
  { value: 'emergency_response', label: 'Emergency response' },
  { value: 'utility_energy', label: 'Utility / energy' },
  { value: 'federal', label: 'Federal' },
  { value: 'industrial', label: 'Industrial' },
] as const

export const OWNER_TYPES = [
  { value: 'private_owner', label: 'Private owner' },
  { value: 'municipality', label: 'Municipality' },
  { value: 'state_agency', label: 'State agency' },
  { value: 'federal_agency', label: 'Federal agency' },
  { value: 'general_contractor', label: 'General contractor' },
  { value: 'developer', label: 'Developer' },
] as const

export const FUNDING_TYPES = [
  { value: 'private', label: 'Private' },
  { value: 'public', label: 'Public' },
  { value: 'grant_funded', label: 'Grant funded' },
  { value: 'federal_assistance', label: 'Federal assistance' },
  { value: 'hud_cdbg', label: 'HUD / CDBG' },
  { value: 'nyserda', label: 'NYSERDA' },
  { value: 'dot_infrastructure', label: 'DOT / infrastructure' },
] as const

export const LABOR_CLASSIFICATIONS = [
  { value: 'non_prevailing_wage', label: 'Non-prevailing wage' },
  { value: 'prevailing_wage', label: 'Prevailing wage required' },
] as const

export const SET_ASIDE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'mwbe', label: 'MWBE participation' },
  { value: 'wbe', label: 'WBE participation' },
  { value: 'wosb', label: 'WOSB participation' },
  { value: 'sdvosb', label: 'SDVOSB participation' },
  { value: 'section_3', label: 'Section 3' },
  { value: 'minority_goals', label: 'Minority participation goals' },
] as const

export const RISK_LEVELS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
] as const

export const CONTRACT_VALUE_BANDS = [
  { value: 'under_100k', label: 'Under $100k' },
  { value: '100k_500k', label: '$100k – $500k' },
  { value: '500k_plus', label: '$500k+' },
] as const
