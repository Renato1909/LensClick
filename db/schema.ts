// Referencia do esquema D1. A migracao executavel correspondente fica em
// migrations/; alteracoes futuras devem atualizar ambos.
export const schemaVersion = 13;

export const tables = {
  users: "users",
  sessions: "sessions",
  passwordResetTokens: "password_reset_tokens",
  emailVerificationTokens: "email_verification_tokens",
  contactMessages: "contact_messages",
  newsletterSubscriptions: "newsletter_subscriptions",
  rateLimits: "rate_limits",
  professionalProfiles: "professional_profiles",
  portfolioItems: "portfolio_items",
  reviewRequests: "review_requests",
  reviews: "reviews",
  reviewAudit: "review_audit",
  conversations: "conversations",
  messages: "messages",
  monitorState: "monitor_state",
  monitorMinuteBuckets: "monitor_minute_buckets"
} as const;
