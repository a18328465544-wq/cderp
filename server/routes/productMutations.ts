import type {Express, Request, RequestHandler} from "express";
import {parseHttpDto, productImportDto, productTemplateCreateDto, productTemplateUpdateDto} from "../httpDto.ts";
import {saveStateRecords} from "../db.ts";
import {stateDeleteRecords, stateMergeRecords, statePatchResponse, type StateDeletePatch, type StateMergePatch} from "../statePatch.ts";
import type {createStoreActions} from "../store.ts";
import type {ProductTemplate, SystemUserAccount} from "../../src/types.ts";

type ProductRequest = Request & {
  authUser?: SystemUserAccount;
};

type ProductMutationDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  requireDeletePermission: RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  persistProductImages: (req: ProductRequest, product: ProductTemplate) => Promise<ProductTemplate>;
  productTemplateMerge: (req: ProductRequest, products: ProductTemplate | ProductTemplate[] | null) => StateMergePatch;
  deleteMerge: () => StateMergePatch;
};

function okMerge(data: unknown, stateMerge: StateMergePatch, stateDelete: StateDeletePatch = {}) {
  return statePatchResponse(data, stateMerge, stateDelete);
}

/**
 * Product-template writes are isolated from the application composition root.
 * The injected merge/image hooks keep the current state-patch contract intact
 * while the product domain is moved toward its own service boundary.
 */
export function registerProductMutationRoutes(app: Express, dependencies: ProductMutationDependencies) {
  app.post(
    "/api/products",
    dependencies.requireMenu("products"),
    dependencies.asyncRoute(async (req, res) => {
      const productRequest = req as ProductRequest;
      const command = parseHttpDto(productTemplateCreateDto, req.body);
      const created = await dependencies.persistProductImages(productRequest, dependencies.actions(req).addProductTemplate(command));
      const stateMerge = dependencies.productTemplateMerge(productRequest, created);
      await saveStateRecords(stateMergeRecords(stateMerge));
      res.status(201).json(okMerge(created, stateMerge));
    }),
  );

  app.post(
    "/api/products/import",
    dependencies.requireMenu("products"),
    dependencies.asyncRoute(async (req, res) => {
      const {products} = parseHttpDto(productImportDto, {products: Array.isArray(req.body) ? req.body : req.body?.products});
      const imported = dependencies.actions(req).addProductTemplates(products);
      const stateMerge = dependencies.productTemplateMerge(req as ProductRequest, imported);
      await saveStateRecords(stateMergeRecords(stateMerge));
      res.status(201).json(okMerge(imported, stateMerge));
    }),
  );

  app.put(
    "/api/products/:id",
    dependencies.requireMenu("products"),
    dependencies.asyncRoute(async (req, res) => {
      const productRequest = req as ProductRequest;
      const command = parseHttpDto(productTemplateUpdateDto, req.body);
      const updated = await dependencies.persistProductImages(
        productRequest,
        dependencies.actions(req).updateProductTemplate({...command, id: req.params.id!}),
      );
      const stateMerge = dependencies.productTemplateMerge(productRequest, updated);
      await saveStateRecords(stateMergeRecords(stateMerge));
      res.json(okMerge(updated, stateMerge));
    }),
  );

  app.delete(
    "/api/products/:id",
    dependencies.requireMenu("products"),
    dependencies.requireDeletePermission,
    dependencies.asyncRoute(async (req, res) => {
      const deleted = dependencies.actions(req).deleteProductTemplate(req.params.id!);
      const stateMerge = dependencies.deleteMerge();
      const stateDelete = {products: deleted?.id ? [deleted.id] : []};
      await saveStateRecords([...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)]);
      res.status(deleted ? 200 : 404).json(okMerge(deleted, stateMerge, stateDelete));
    }),
  );
}
