// Referencia do esquema D1. A migracao executavel correspondente fica em
// migrations/; alteracoes futuras devem atualizar ambos.
export const schemaVersion = 4;

export const tables = {
  users: "users",
  sessions: "sessions",
  passwordResetTokens: "password_reset_tokens",
  contactMessages: "contact_messages",
  newsletterSubscriptions: "newsletter_subscriptions",
  rateLimits: "rate_limits",
  professionalProfiles: "professional_profiles",
  portfolioItems: "portfolio_items"
} as const;
