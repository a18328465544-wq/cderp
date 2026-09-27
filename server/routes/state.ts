import type { Express, Request, RequestHandler, Response } from "express";
import type { PublicStateMode } from "../publicState.ts";
import {parseHttpDto, stateModeQueryDto} from "../httpDto.ts";

type StateRequest = Request & {
  authToken?: string;
  authUser?: unknown;
};

type StateDependencies = {
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getRevision: () => number | Promise<number>;
  getPublicState: (req: StateRequest, mode: PublicStateMode) => unknown;
  getCurrentUser: (req: StateRequest) => unknown;
  createCsrfToken: (token: string) => string;
};

/** Lightweight runtime state endpoints stay separate from business route composition. */
export function registerStateRevisionRoute(app: Express, dependencies: StateDependencies) {
  app.get("/api/state/revision", dependencies.asyncRoute(async (_req: Request, res: Response) => {
    res.json({ data: { revision: await dependencies.getRevision() } });
  }));
}

export function registerStateRoutes(app: Express, dependencies: StateDependencies) {
  app.get("/api/state", (req: Request, res: Response) => {
    const stateRequest = req as StateRequest;
    const query = parseHttpDto(stateModeQueryDto, req.query);
    const mode: PublicStateMode = query.mode;
    res.json({ data: dependencies.getPublicState(stateRequest, mode), meta: { stateMode: mode, stateRevision: dependencies.getRevision() } });
  });

  app.get("/api/auth/me", (req: Request, res: Response) => {
    const stateRequest = req as StateRequest;
    const user = stateRequest.authUser ? dependencies.getCurrentUser(stateRequest) : null;
    res.json({ data: user && stateRequest.authToken ? { ...user as Record<string, unknown>, csrfToken: dependencies.createCsrfToken(stateRequest.authToken) } : user });
  });
}
