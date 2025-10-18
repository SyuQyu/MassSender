export type User = {
  id: string;
  email: string;
  full_name?: string | null;
  timezone: string;
  is_active: boolean;
  points_balance: number;
  plan_expires_at?: string | null;
  created_at: string;
};

export type UserSearchResult = {
  id: string;
  email: string;
  full_name?: string | null;
};

export type Tokens = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

export type AuthResponse = {
  tokens: Tokens;
  user: User;
};

export type SessionStatus = "waiting" | "linked" | "expired" | "error";

export type Session = {
  id: string;
  status: SessionStatus;
  label: string;
  device_name?: string | null;
  avatar_color?: string | null;
  priority: number;
  linked_devices: string[];
  qr_png?: string | null;
  metadata?: Record<string, unknown> | null;
  expires_at?: string | null;
  last_seen_at?: string | null;
  last_qr_at?: string | null;
  last_error_message?: string | null;
  created_at: string;
};

export type ContactList = {
  id: string;
  name: string;
  source: "upload" | "group";
  total_contacts: number;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

export type Contact = {
  id: string;
  name?: string | null;
  phone_e164: string;
  consent: boolean;
  created_at: string;
};

export type Campaign = {
  id: string;
  name: string;
  status: string;
  list_id: string;
  user_id: string;
  session_id?: string | null;
  session_label?: string | null;
  template_body: string;
  template_variables: string[];
  media_url?: string | null;
  document_url?: string | null;
  throttle_min_seconds: number;
  throttle_max_seconds: number;
  scheduled_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
};

export type CampaignProgress = {
  total: number;
  queued: number;
  sending: number;
  sent: number;
  failed: number;
  read: number;
  status: string;
};

export type ActiveCampaignSummary = {
  id: string;
  name: string;
  status: string;
  session_id?: string | null;
  session_label?: string | null;
  progress: CampaignProgress;
};

export type CampaignRecipient = {
  id: string;
  name?: string | null;
  phone_e164: string;
  status: string;
  attempts: number;
  sent_at?: string | null;
  read_at?: string | null;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
};

export type WalletSummary = {
  balance: number;
  plan_expires_at?: string | null;
  points_per_recipient: number;
  max_daily_recipients: number;
  max_campaign_recipients: number;
  expiring_points: number;
  next_expiry_at?: string | null;
  support_whatsapp_number?: string | null;
  can_allocate_points: boolean;
};

export type WalletTransaction = {
  id: string;
  txn_type: string;
  points: number;
  balance_after: number;
  reference?: string | null;
  expires_at?: string | null;
  created_at: string;
};

export type WalletGrantResult = {
  transaction_id: string;
  target_email: string;
  granted_points: number;
  new_balance: number;
  expires_at?: string | null;
};

export type WhatsAppGroup = {
  id: string;
  name?: string | null;
  participant_count: number;
};

export type WhatsAppMember = {
  phone_e164: string;
  name?: string | null;
};

export type AutoResponseRule = {
  id: string;
  name: string;
  trigger_type: "keyword" | "contains" | "regex";
  trigger_value: string;
  response_text?: string | null;
  response_media_url?: string | null;
  cooldown_seconds: number;
  active: boolean;
  active_windows: TimeWindow[];
  created_at: string;
  updated_at: string;
};

export type TimeWindow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

export type ActiveSchedule = {
  id: string;
  name: string;
  timezone: string;
  windows: TimeWindow[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AiSuggestionRequest = {
  topic: "campaign_message" | "automation_response";
  prompt: string;
  context?: Record<string, unknown> | null;
  temperature?: number;
};

export type AiSuggestionResponse = {
  text: string;
  generated_at: string;
};

export type AiSubscriptionStatus = {
  active: boolean;
  expires_at?: string | null;
  plan_name?: string | null;
  trial_available: boolean;
};

export type AiSubscriptionGrantRequest = {
  user_email: string;
  plan: "5d" | "15d" | "30d";
};
