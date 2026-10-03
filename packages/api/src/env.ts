export const ENV = {
  port: Number(process.env.API_PORT ?? 8787),
  publicUrl: (process.env.PUBLIC_URL ?? "http://localhost:5173").replace(/\/$/, ""),
  discordClientId: process.env.DISCORD_CLIENT_ID ?? "",
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-only-secret",
  admins: new Set((process.env.ADMIN_DISCORD_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean)),
  secureCookies: (process.env.PUBLIC_URL ?? "").startsWith("https://"),
  /** Only behind a reverse proxy (Caddy, nginx): otherwise anyone could fake X-Forwarded-For and dodge the rate limit. */
  trustProxy: /^(1|true|yes)$/i.test(process.env.TRUST_PROXY ?? ""),
};
