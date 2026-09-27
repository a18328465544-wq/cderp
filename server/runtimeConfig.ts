/**
 * Runtime topology is deliberately explicit.  The API still keeps a small
 * in-process projection for fast reads, so production must run as one fork
 * until that projection is replaced by a shared read model.
 */
export type StateRuntimeMode = "single-instance";

function valueFrom(env: NodeJS.ProcessEnv, key: string) {
  return env[key]?.trim() || "";
}

export function resolveStateRuntimeMode(env: NodeJS.ProcessEnv = process.env): StateRuntimeMode | undefined {
  const configured = valueFrom(env, "STATE_RUNTIME_MODE");
  if (!configured && env.NODE_ENV !== "production") return "single-instance";
  return configured === "single-instance" ? configured : undefined;
}

export function assertStateRuntimeMode(env: NodeJS.ProcessEnv = process.env): StateRuntimeMode {
  const mode = resolveStateRuntimeMode(env);
  if (!mode) {
    throw new Error(
      "生产运行必须显式设置 STATE_RUNTIME_MODE=single-instance；当前服务仍依赖进程内投影，禁止无声明扩容。",
    );
  }
  return mode;
}
