/** Scanner autofocus is for an active desktop workstation, never a phone/tablet keyboard. */
export function shouldAutofocusOutboundScan(active: boolean, narrowViewport: boolean, coarsePointer: boolean) {
  return active && !narrowViewport && !coarsePointer;
}
