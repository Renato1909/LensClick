// Referencia do esquema D1. A migracao executavel correspondente fica em
// migrations/; alteracoes futuras devem atualizar ambos.
//
// Escopo: este catalogo lista as TABELAS e a versao do schema. Colunas,
// indices e CHECKs sao definidos exclusivamente pelas migrations, que sao a
// fonte executavel. `schemaVersion` deve ser igual a quantidade de arquivos
// em migrations/ e a ultima migration deve ter esse mesmo prefixo — o teste
// `o catalogo db/schema.ts esta em sintonia com as migrations publicadas`
// verifica essa invariante.
export const schemaVersion = 14;

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
