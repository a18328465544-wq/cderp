export interface FormSubmissionTicket {
  readonly scope: string;
  readonly fingerprint: string;
}

/** Compare raw editor snapshots, not a resolver's trimmed/transformed DTO. */
export function createFormSubmissionGuard() {
  let active: FormSubmissionTicket | undefined;
  return {
    begin(scope: string, values: unknown): FormSubmissionTicket | undefined {
      if (active?.scope === scope) return;
      active = Object.freeze({scope, fingerprint: JSON.stringify(values)});
      return active;
    },
    owns(ticket: FormSubmissionTicket, scope: string) {
      return active === ticket && ticket.scope === scope;
    },
    canCommit(ticket: FormSubmissionTicket, scope: string, values: unknown) {
      return active === ticket && ticket.scope === scope && ticket.fingerprint === JSON.stringify(values);
    },
    finish(ticket: FormSubmissionTicket) {
      if (active !== ticket) return false;
      active = undefined;
      return true;
    },
    invalidate() {active = undefined;},
  };
}
