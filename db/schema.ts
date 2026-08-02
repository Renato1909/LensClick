// Referencia do esquema D1. A migracao executavel correspondente fica em
// migrations/0001_initial.sql; alteracoes futuras devem atualizar ambos.
export const schemaVersion = 1;

export const tables = {
  users: "users",
  sessions: "sessions",
  contactMessages: "contact_messages",
  newsletterSubscriptions: "newsletter_subscriptions",
  rateLimits: "rate_limits"
} as const;
