import {createIdempotencyKey} from "./client";

/** One logical payload keeps its identity across lost responses and retries.
 * Editing the payload starts a new attempt, avoiding a key/body conflict. */
export function createSubmissionIdentity(prefix: string) {
  let fingerprint = "";
  let key = "";
  return {
    keyFor(payload: unknown) {
      const next = JSON.stringify(payload);
      if (!key || next !== fingerprint) {
        fingerprint = next;
        key = createIdempotencyKey(prefix);
      }
      return key;
    },
    reset() {fingerprint = ""; key = "";},
  };
}

export type SubmissionKey = string | ReturnType<typeof createSubmissionIdentity>;

/** Resolve after DTO normalization, so equivalent HTTP bodies share a key. */
export function resolveSubmissionKey(identity: SubmissionKey | undefined, payload: unknown) {
  return typeof identity === "string" ? identity : identity?.keyFor(payload);
}
