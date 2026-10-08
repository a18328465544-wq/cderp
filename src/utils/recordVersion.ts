/** Legacy documents have no stored revision; their first editable version is one. */
export function getRecordVersion(record: {recordVersion?: unknown}): number {
  return typeof record.recordVersion === "number" && Number.isSafeInteger(record.recordVersion) && record.recordVersion > 0
    ? record.recordVersion : 1;
}
