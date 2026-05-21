module.exports = {
  apps: [
    { name: "archon-web", script: "node_modules/next/dist/bin/next", args: "start -p 3000", env: { NODE_ENV: "production", PATH: `${process.env.PATH}:/root/.local/bin` } },
    { name: "archon-worker", script: "pnpm", args: "worker", env: { NODE_ENV: "production", DOTENV_CONFIG_PATH: ".env.local", PATH: `${process.env.PATH}:/root/.local/bin` } },
  ],
};
