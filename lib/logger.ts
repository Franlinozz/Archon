import pino from "pino";
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "password",
      "*.password",
      "OPENAI_API_KEY",
      "*.OPENAI_API_KEY",
      "DATABASE_URL",
      "*.DATABASE_URL",
      "PRIVATE_KEY",
      "*.PRIVATE_KEY",
      "ARCHON_WALLET_PRIVATE_KEY",
      "*.ARCHON_WALLET_PRIVATE_KEY",
    ],
    censor: "[redacted]",
  },
});
