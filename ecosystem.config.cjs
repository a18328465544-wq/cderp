module.exports = {
  apps: [
    {
      name: "gpu-erp-api",
      cwd: "/home/ubuntu/gpu-erp",
      script: "npm",
      args: "run start:api",
      // The API keeps a small in-process read projection. Keep the supported
      // production topology explicit until that projection is shared.
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        API_PORT: "3001",
        STATE_RUNTIME_MODE: "single-instance",
      },
      max_restarts: 10,
      restart_delay: 3000,
      kill_timeout: 10000,
    },
  ],
};
