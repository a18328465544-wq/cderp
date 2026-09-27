const baseUrl = (process.env.SMOKE_BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");

async function check(path, expectedStatuses) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`${path} returned ${response.status}; expected ${expectedStatuses.join("/")}`);
  }
  return response;
}

await check("/api/health", [200]);
await check("/api/ready", [200]);
await check("/api/state", [401]);
if (process.env.SMOKE_CHECK_HOME === "1") await check("/", [200]);
console.log(`PASS: public smoke checks passed for ${baseUrl}`);
