import type {Express, RequestHandler, Response} from "express";
import {getMediaAsset, listEntityImages, MEDIA_MAX_BYTES, MEDIA_TARGET_BYTES, replaceEntityImages} from "../mediaRepository.ts";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {mediaListQueryDto, mediaReplaceDto, parseHttpDto} from "../httpDto.ts";

type MediaRequest = AuthenticatedRequest<unknown>;

type MediaRouteDependencies = {
  requireAnyMenu: (menuIds: string[]) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  actorForRequest: (req: MediaRequest) => string;
  sendNotFound: (req: MediaRequest, res: Response, code: string, message: string) => void;
};

const mediaMenuIds = [
  "products", "inventory", "inspections", "crm", "purchase_add", "purchase_list",
  "sales_add", "sales_list", "sales_outbound", "aftersales", "quotes", "finance_reports",
  "payment_in", "payment_out", "return_sales", "return_purchase", "return_orders",
];

/** Media endpoints are shared by forms across domains, so they have their own
 * boundary instead of living next to one specific business route. */
export function registerMediaRoutes(app: Express, dependencies: MediaRouteDependencies) {
  app.post(
    "/api/media",
    dependencies.requireAnyMenu(mediaMenuIds),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as MediaRequest;
      const command = parseHttpDto(mediaReplaceDto, req.body);
      const values = command.images !== undefined ? command.images : [command.dataUrl];
      const urls = await replaceEntityImages({
        tenantId: authRequest.tenantId,
        entityType: command.entityType,
        entityId: command.entityId,
        relationRole: command.relationRole,
        values,
        createdBy: dependencies.actorForRequest(authRequest),
      });
      res.status(201).json({data: {urls, targetBytes: MEDIA_TARGET_BYTES, maxBytes: MEDIA_MAX_BYTES}});
    }),
  );

  app.get(
    "/api/media",
    dependencies.requireAnyMenu(mediaMenuIds),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as MediaRequest;
      const query = parseHttpDto(mediaListQueryDto, req.query);
      const assets = await listEntityImages(
        query.entityType,
        query.entityId,
        query.relationRole || undefined,
        authRequest.tenantId,
      );
      res.json({data: assets});
    }),
  );

  app.get(
    "/api/media/assets/:id",
    dependencies.requireAnyMenu(mediaMenuIds),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as MediaRequest;
      const asset = await getMediaAsset(req.params.id!, authRequest.tenantId);
      if (!asset) {
        dependencies.sendNotFound(authRequest, res, "MEDIA_NOT_FOUND", "图片资源不存在");
        return;
      }
      res.setHeader("Content-Type", asset.mime_type);
      res.setHeader("Content-Length", String(asset.content.length));
      res.setHeader("Cache-Control", "private, max-age=300");
      res.send(asset.content);
    }),
  );
}
