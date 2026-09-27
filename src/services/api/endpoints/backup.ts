import {apiDownload, apiRequest} from "../client";

export interface BackupRecord {
  id: string;
  createdAt: string;
  file?: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === null || value === undefined ? fallback : String(value);
}

function adaptBackup(value: unknown): BackupRecord {
  const item = record(value);
  const createdAt = text(item.createdAt || item.created_at || item.time, "—");
  const id = text(item.id || item.file) || (createdAt !== "—" ? `backup-${createdAt}` : "未命名备份");
  return {id, createdAt, file: text(item.file) || undefined};
}

export const backupApi = {
  async list(signal?: AbortSignal): Promise<BackupRecord[]> {
    const response = await apiRequest<{data?: unknown}>("/api/backup", {signal});
    const data = record(response).data;
    return Array.isArray(data) ? data.map(adaptBackup) : [];
  },
  async create(signal?: AbortSignal): Promise<BackupRecord> {
    const response = await apiRequest<{data?: unknown}>("/api/backup", {method: "POST", signal});
    return adaptBackup(record(response).data);
  },
  downloadUrl() {
    return "/api/backup/download";
  },
  async download(signal?: AbortSignal) {
    return apiDownload("/api/backup/download", {signal});
  },
};
