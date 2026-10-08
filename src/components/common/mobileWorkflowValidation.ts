type ValidationIssue = {path: PropertyKey[]};
/** Read schema errors, never duplicate domain validation in a mobile flow. */
export function hasWorkflowErrors(issues: readonly ValidationIssue[], fields: readonly string[]) {
  return issues.some((issue) => fields.includes(String(issue.path[0] ?? "")));
}

export function workflowBlockedReason(issues: readonly (ValidationIssue & {message: string})[], fields: readonly string[], fallback: string) {
  return issues.find((issue) => fields.includes(String(issue.path[0] ?? "")))?.message || fallback;
}
