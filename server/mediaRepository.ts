import { createHash } from "node:crypto";
import { withDatabaseTransaction } from "./db.ts";
import type { PoolClient } from "pg";
import { DEFAULT_TENANT_ID } from "./commercialConstants.ts";
import { getCurrentTenantContext } from "./requestTenantContext.ts";
import {imageMimeTypeValues} from "../src/types/media.ts";

export const MEDIA_MAX_BYTES = 110_000;
export const MEDIA_TARGET_BYTES = 100_000;
export const MEDIA_MAX_INPUT_BYTES = 12 * 1024 * 1024;
export const MEDIA_URL_PREFIX = "/api/media/assets/";

const supportedMimeTypes = new Set<string>(imageMimeTypeValues);
const entityPartPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
const imageDataUrlPattern = new RegExp(`^data:(${imageMimeTypeValues.join("|")});base64,([a-z0-9+/=\\s]+)$`, "i");

export type MediaAsset = {
  id: string;
  mimeType: string;
  originalName?: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  sha256: string;
  createdBy?: string;
  createdAt: string;
};

export type MediaRelation = MediaAsset & {
  entityType: string;
  entityId: string;
  relationRole: string;
  sortOrder: number;
};

export class MediaValidationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "MediaValidationError";
    this.code = code;
    this.status = status;
  }
}

type ParsedImage = {
  mimeType: string;
  content: Buffer;
};

function validateEntityPart(value: string, label: string) {
  if (!entityPartPattern.test(value)) {
    throw new MediaValidationError("INVALID_MEDIA_ENTITY", `${label}格式无效`);
  }
}

function parseDataUrl(dataUrl: unknown): ParsedImage {
  if (typeof dataUrl !== "string" || !dataUrl.trim()) {
    throw new MediaValidationError("INVALID_IMAGE", "图片数据不能为空");
  }
  const match = imageDataUrlPattern.exec(dataUrl.trim());
  if (!match) {
    throw new MediaValidationError("UNSUPPORTED_IMAGE", "仅支持 JPG、PNG 或 WEBP 图片");
  }
  const rawMimeType = match[1];
  const encodedContent = match[2];
  if (!rawMimeType || !encodedContent) throw new MediaValidationError("INVALID_IMAGE", "图片内容为空");
  const mimeType = rawMimeType.toLowerCase();
  if (!supportedMimeTypes.has(mimeType)) {
    throw new MediaValidationError("UNSUPPORTED_IMAGE", "仅支持 JPG、PNG 或 WEBP 图片");
  }
  const content = Buffer.from(encodedContent.replace(/\s+/g, ""), "base64");
  if (!content.length) throw new MediaValidationError("INVALID_IMAGE", "图片内容为空");
  if (content.length > MEDIA_MAX_INPUT_BYTES) {
    throw new MediaValidationError("IMAGE_INPUT_TOO_LARGE", "原始图片不能超过 12MB");
  }
  if (content.length > MEDIA_MAX_BYTES) {
    throw new MediaValidationError("IMAGE_NEEDS_COMPRESSION", `图片压缩后必须不超过 ${MEDIA_MAX_BYTES} 字节（约 100KB）`);
  }
  return { mimeType, content };
}

function tenantScope(tenantId?: string) {
  return tenantId?.trim() || getCurrentTenantContext()?.tenantId || DEFAULT_TENANT_ID;
}

async function reserveMediaBytes(client: PoolClient, tenantId: string, bytes: number) {
  const subscription = await client.query<{ media_bytes_limit: string }>(
    "SELECT media_bytes_limit::text FROM gpu_subscriptions WHERE tenant_id = $1 FOR UPDATE",
    [tenantId],
  );
  const limit = Number(subscription.rows[0]?.media_bytes_limit);
  if (!Number.isFinite(limit)) throw new MediaValidationError("MEDIA_QUOTA_UNAVAILABLE", "企业媒体额度未配置", 503);
  // media_bytes_limit is a storage ceiling, not a monthly transfer quota.
  // Sum durable assets while holding the subscription row lock so concurrent
  // uploads cannot both pass the same remaining capacity check.
  const current = await client.query<{ bytes: string }>(
    "SELECT COALESCE(SUM(size_bytes), 0)::text AS bytes FROM gpu_media_assets WHERE tenant_id = $1",
    [tenantId],
  );
  const previous = Number(current.rows[0]?.bytes || 0);
  if (previous + bytes > limit) throw new MediaValidationError("MEDIA_QUOTA_EXCEEDED", "已超过企业媒体存储额度", 409);
  const periodStart = new Date().toISOString().slice(0, 7) + "-01";
  await client.query(
    `INSERT INTO gpu_usage_counters (tenant_id, metric, period_start, quantity)
     VALUES ($1, 'media_bytes', $2::date, $3)
     ON CONFLICT (tenant_id, metric, period_start)
     DO UPDATE SET quantity = gpu_usage_counters.quantity + EXCLUDED.quantity, updated_at = NOW()`,
    [tenantId, periodStart, bytes],
  );
}

export function imageUrlForAsset(id: string) {
  return `${MEDIA_URL_PREFIX}${encodeURIComponent(id)}`;
}

export function parseMediaAssetId(url: string) {
  if (!url.startsWith(MEDIA_URL_PREFIX)) return null;
  const id = decodeURIComponent(url.slice(MEDIA_URL_PREFIX.length));
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(id) ? id : null;
}

function mapAsset(row: {
  id: string;
  mime_type: string;
  original_name: string | null;
  size_bytes: number;
  width: number | null;
  height: number | null;
  sha256: string;
  created_by: string | null;
  created_at: Date;
}): MediaAsset {
  return {
    id: row.id,
    mimeType: row.mime_type,
    originalName: row.original_name || undefined,
    sizeBytes: Number(row.size_bytes),
    width: row.width || undefined,
    height: row.height || undefined,
    sha256: row.sha256,
    createdBy: row.created_by || undefined,
    createdAt: row.created_at.toISOString(),
  };
}

export async function replaceEntityImages(input: {
  tenantId?: string;
  entityType: string;
  entityId: string;
  values: unknown[];
  relationRole?: string;
  createdBy?: string;
}): Promise<string[]> {
  const tenantId = tenantScope(input.tenantId);
  const entityType = String(input.entityType || "").trim();
  const entityId = String(input.entityId || "").trim();
  const relationRole = String(input.relationRole || "attachment").trim() || "attachment";
  validateEntityPart(entityType, "实体类型");
  validateEntityPart(entityId, "实体编号");
  validateEntityPart(relationRole, "图片用途");
  if (!Array.isArray(input.values) || input.values.length > 20) {
    throw new MediaValidationError("INVALID_IMAGE_COUNT", "单个业务对象最多关联 20 张图片");
  }

  return withDatabaseTransaction(async (client) => {
    const assetIds: string[] = [];
    for (const [index, value] of input.values.entries()) {
      const existingId = typeof value === "string" ? parseMediaAssetId(value) : null;
      let assetId = existingId;
      if (assetId) {
        const existing = await client.query<{ id: string }>("SELECT id FROM gpu_media_assets WHERE id = $1 AND tenant_id = $2", [assetId, tenantId]);
        if (!existing.rowCount) throw new MediaValidationError("MEDIA_NOT_FOUND", "图片资源不存在或已被删除");
      } else {
        const parsed = parseDataUrl(value);
        const sha256 = createHash("sha256").update(parsed.content).digest("hex");
        const existing = await client.query<{ id: string }>(
          "SELECT id FROM gpu_media_assets WHERE tenant_id = $1 AND sha256 = $2 LIMIT 1",
          [tenantId, sha256],
        );
        if (existing.rows[0]) {
          assetId = existing.rows[0].id;
        } else {
          assetId = tenantId === DEFAULT_TENANT_ID
            ? `IMG-${sha256.slice(0, 24)}`
            : `IMG-${tenantId.slice(-12)}-${sha256.slice(0, 20)}`;
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO gpu_media_assets (id, tenant_id, mime_type, original_name, size_bytes, sha256, content, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (tenant_id, sha256) DO NOTHING
             RETURNING id`,
            [assetId, tenantId, parsed.mimeType, undefined, parsed.content.length, sha256, parsed.content, input.createdBy || null],
          );
          if (inserted.rows[0]) {
            await reserveMediaBytes(client, tenantId, parsed.content.length);
          } else {
            const resolved = await client.query<{ id: string }>(
              "SELECT id FROM gpu_media_assets WHERE tenant_id = $1 AND sha256 = $2 LIMIT 1",
              [tenantId, sha256],
            );
            assetId = resolved.rows[0]?.id || assetId;
          }
        }
      }
      assetIds.push(assetId);
      await client.query(
        `INSERT INTO gpu_media_relations (tenant_id, asset_id, entity_type, entity_id, relation_role, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (asset_id, entity_type, entity_id, relation_role)
         DO UPDATE SET sort_order = EXCLUDED.sort_order`,
        [tenantId, assetId, entityType, entityId, relationRole, index],
      );
    }
    await client.query(
      `DELETE FROM gpu_media_relations
       WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3 AND relation_role = $4
         AND NOT (asset_id = ANY($5::text[]))`,
      [tenantId, entityType, entityId, relationRole, assetIds],
    );
    return assetIds.map(imageUrlForAsset);
  });
}

export async function listEntityImages(entityType: string, entityId: string, relationRole?: string, tenantId?: string): Promise<MediaRelation[]> {
  const scope = tenantScope(tenantId);
  validateEntityPart(entityType, "实体类型");
  validateEntityPart(entityId, "实体编号");
  const role = relationRole?.trim();
  if (role) validateEntityPart(role, "图片用途");
  return withDatabaseTransaction(async (client) => {
    const result = await client.query<{
      id: string;
      mime_type: string;
      original_name: string | null;
      size_bytes: number;
      width: number | null;
      height: number | null;
      sha256: string;
      created_by: string | null;
      created_at: Date;
      entity_type: string;
      entity_id: string;
      relation_role: string;
      sort_order: number;
    }>(
      `SELECT a.id, a.mime_type, a.original_name, a.size_bytes, a.width, a.height, a.sha256,
              a.created_by, a.created_at, r.entity_type, r.entity_id, r.relation_role, r.sort_order
       FROM gpu_media_relations r
       JOIN gpu_media_assets a ON a.id = r.asset_id AND a.tenant_id = r.tenant_id
       WHERE r.tenant_id = $1 AND r.entity_type = $2 AND r.entity_id = $3 ${role ? "AND r.relation_role = $4" : ""}
       ORDER BY r.sort_order ASC, r.created_at ASC`,
      role ? [scope, entityType, entityId, role] : [scope, entityType, entityId],
    );
    return result.rows.map((row) => ({ ...mapAsset(row), entityType: row.entity_type, entityId: row.entity_id, relationRole: row.relation_role, sortOrder: row.sort_order }));
  });
}

export async function getMediaAsset(id: string, tenantId?: string) {
  const scope = tenantScope(tenantId);
  validateEntityPart(id, "图片编号");
  return withDatabaseTransaction(async (client) => {
    const result = await client.query<{ id: string; mime_type: string; content: Buffer }>(
      "SELECT id, mime_type, content FROM gpu_media_assets WHERE id = $1 AND tenant_id = $2",
      [id, scope],
    );
    return result.rows[0] || null;
  });
}
