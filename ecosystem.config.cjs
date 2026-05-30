// DB_POOL_MAX caps pg connections per process so web (6) + worker (4) = 10 total stays
// well under the Supabase transaction pooler ceiling. See ADR 0008.
module.exports = {
  apps: [
    { name: "archon-web", script: "node_modules/next/dist/bin/next", args: "start -p 3000", env: { NODE_ENV: "production", DB_POOL_MAX: "6", PATH: `${process.env.PATH}:/root/.local/bin` } },
    { name: "archon-worker", script: "pnpm", args: "worker", env: { NODE_ENV: "production", DOTENV_CONFIG_PATH: ".env.local", DB_POOL_MAX: "4", PATH: `${process.env.PATH}:/root/.local/bin` } },
  ],
};
