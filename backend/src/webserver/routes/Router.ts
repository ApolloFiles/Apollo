import type { FastifyReply } from 'fastify';
import type { FastifyInstanceWithZod } from '../server/FastifyWebServer.js';

export type RouteReturn = FastifyReply | Promise<FastifyReply>;

export default interface Router {
  getRoutePrefix?(): string;

  allowUnauthenticatedAccess?(): boolean;

  register(server: FastifyInstanceWithZod, options?: unknown): void;
}
