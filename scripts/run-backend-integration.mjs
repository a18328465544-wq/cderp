import { execFileSync, spawnSync } from "node:child_process";

const containerName = `gpu-erp-integration-${process.pid}-${Date.now()}`;
const postgresUser = "gpu_erp_test";
const postgresPassword = "gpu_erp_test_password";
const postgresDatabase = "gpu_erp_test";

function docker(...args) {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function stopContainer() {
  try {
    docker("stop", containerName);
  } catch {
    // The --rm container may already be gone. Cleanup must not hide test output.
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

try {
  docker(
    "run",
    "--detach",
    "--rm",
    "--name",
    containerName,
    "--publish",
    "127.0.0.1::5432",
    "--env",
    `POSTGRES_USER=${postgresUser}`,
    "--env",
    `POSTGRES_PASSWORD=${postgresPassword}`,
    "--env",
    `POSTGRES_DB=${postgresDatabase}`,
    "postgres:16-alpine",
  );

  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync("docker", [
      "exec",
      containerName,
      "pg_isready",
      "-U",
      postgresUser,
      "-d",
      postgresDatabase,
    ], { stdio: "ignore" });
    if (probe.status === 0) {
      ready = true;
      break;
    }
    await wait(500);
  }
  if (!ready) throw new Error("PostgreSQL integration container did not become ready within 30 seconds");

  const portOutput = docker("port", containerName, "5432/tcp");
  const portMatch = portOutput.split("\n")[0]?.match(/:(\d+)$/);
  if (!portMatch?.[1]) throw new Error(`Unable to resolve PostgreSQL test port: ${portOutput}`);

  const testPassword = "test-only-admin-password";
  const env = { ...process.env };
  delete env.DATABASE_URL;
  Object.assign(env, {
    NODE_ENV: "test",
    TEST_DATABASE_URL: `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${portMatch[1]}/${postgresDatabase}`,
    TEST_DATABASE_SSL: "false",
    POSTGRES_IMPORT_LEGACY_JSON: "false",
    RUN_BACKEND_HTTP_TESTS: "1",
    BACKEND_TEST_USERNAME: "admin",
    BACKEND_TEST_PASSWORD: testPassword,
    BOOTSTRAP_ADMIN_PASSWORD: testPassword,
    OPEN_API_TOKEN: "test-only-open-api-token-not-for-production",
  });

  const result = spawnSync("npm", ["run", "test:backend-http"], {
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  stopContainer();
}
