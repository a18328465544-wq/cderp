module.exports = {
  apps: [
    {
      name: "gpu-erp-api-staging",
      cwd: __dirname,
      script: "npm",
      args: "run start:api",
      // Staging mirrors the production topology so concurrency bugs are not
      // hidden by a different process model.
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "staging",
        API_PORT: "3011",
        STATE_RUNTIME_MODE: "single-instance",
      },
      max_restarts: 5,
      restart_delay: 2000,
      kill_timeout: 10000,
    },
  ],
};
