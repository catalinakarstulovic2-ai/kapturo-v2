export interface UserModule {
  tipo: string        // 'licitador' | 'prospector'
  niche?: string      // 'inmobiliaria' | 'agencia' | etc.
  pais?: string
  fuentes?: string[]
}

export interface User {
  id: string
  email: string
  full_name: string
  role: 'super_admin' | 'admin' | 'member'
  tenant_id: string | null
  modules: UserModule[]
}

export interface Prospect {
  id: string
  company_name: string
  rut?: string
  contact_name?: string
  contact_title?: string
  email?: string
  phone?: string
  whatsapp?: string
  linkedin_url?: string
  address?: string
  website?: string
  city?: string
  country?: string
  industry?: string
  score: number
  score_reason?: string
  is_qualified: boolean
  status: 'new' | 'qualified' | 'disqualified' | 'contacted' | 'responded' | 'converted'
  source_module?: string
  // Inmobiliaria-specific
  signal_text?: string
  fuente_inmobiliaria?: string
  // Prospector-specific
  web_status?: 'sin_web' | 'solo_redes' | 'tiene_web'
  source_url?: string
  notes?: string
  notes_history?: { text: string; created_at: string }[]
  excluido?: boolean
  alarma_fecha?: string
  alarma_motivo?: string
  in_pipeline?: boolean
  created_at: string
}

export interface PipelineStage {
  id: string
  name: string
  color: string
  order: number
  is_won: boolean
  is_lost: boolean
  cards: PipelineCard[]
}

export interface PipelineCard {
  id: string
  prospect_id: string
  stage_id: string
  notes?: string
  next_action_at?: string
  created_at?: string
  prospect?: {
    company_name: string
    contact_name?: string
    contact_title?: string
    email?: string
    phone?: string
    whatsapp?: string
    website?: string
    city?: string
    country?: string
    industry?: string
    score: number
    score_reason?: string
    web_status?: string
    source_module?: string
    status?: string
    source?: string
    // Licitación (adjudicadas)
    rut?: string
    licitacion_nombre?: string
    licitacion_codigo?: string
    licitacion_organismo?: string
    licitacion_monto_adjudicado?: number
    licitacion_fecha_adjudicacion?: string
  }
}

export interface Message {
  id: string
  conversation_id: string
  direction: 'outbound' | 'inbound'
  channel: 'whatsapp' | 'email'
  status: 'draft' | 'pending_approval' | 'approved' | 'sent' | 'delivered' | 'read' | 'failed'
  body: string
  generated_by_ai: boolean
  created_at: string
}
