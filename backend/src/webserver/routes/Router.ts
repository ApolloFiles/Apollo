import type { FastifyInstance, FastifyReply } from 'fastify';

export type RouteReturn = FastifyReply | Promise<FastifyReply>;

export default interface Router {
  getRoutePrefix?(): string;

  register(server: FastifyInstance, options?: unknown): void;
}
