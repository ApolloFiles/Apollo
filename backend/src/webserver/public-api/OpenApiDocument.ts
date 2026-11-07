import type { OpenApiPluginOptions } from '@sprax/node-framework/openapi';
import type { FastifyInstance, RouteOptions } from 'fastify';
import type AppConfiguration from '../../config/AppConfiguration.js';
import { getAppInfo } from '../../constants.js';

const COMPATIBILITY_POLICY = `
Apollo's public HTTP API. Every endpoint lives under a product scope with its own major version (e.g. \`/api/media/v1/\`).

## Compatibility

* **Additive changes are not breaking**: new endpoints, new optional query parameters, new response keys, new values in enum-typed fields and new sort keys may appear at any time.
* **Enums are open.** Clients must tolerate values they do not know in any enum-typed field and treat them as "unknown".
* **Breaking** are: removing a key, changing a key's type or nullability, changing the meaning of a value, removing an enum value, changing an endpoint's path or method, and changing the pagination or error shapes.
* Breaking changes are announced to known consumers before they ship. Where feasible, the old key keeps being sent for a grace period, possibly populated best-effort.
* A new major version is reserved for a large rework of the API, not for individual breaking changes.

## Behaviour

* The API renders as the authenticated user by default (e.g. a future content-language preference) and every such rendering choice gets an explicit override parameter.
* The API never hides resources based on UI preferences. Those are returned as data on the resource; lists are narrowed only by permissions and explicit parameters.

## Pagination

Collection endpoints are cursor-paginated: pass \`limit\` and, for the next page, the \`nextCursor\` of the previous response. Cursors are opaque, only valid for the same listing and parameters, and \`nextCursor: null\` is the only signal that no further page exists.
`.trim();

/** The parts of the generated document this class touches; `paths` only makes every version of the document assignable */
type GeneratedDocument = {
  paths?: unknown,
  components?: { schemas?: Record<string, unknown> },
};

export class OpenApiDocument {
  /** Operation ids are prefixed with their tag (`media_listLibraries`) because they must be unique across the whole document */
  static readonly TAG_MEDIA = 'media';

  static createPluginOptions(appConfiguration: AppConfiguration): OpenApiPluginOptions {
    return {
      openapi: {
        openapi: '3.1.0',
        info: {
          title: 'Apollo API',
          version: getAppInfo().version,
          description: COMPATIBILITY_POLICY,
          license: {
            name: 'GNU General Public License v3.0 or later',
            identifier: 'GPL-3.0-or-later',
          },
        },
        servers: [{ url: appConfiguration.config.baseUrl }],
        tags: [
          { name: this.TAG_MEDIA, description: 'Apollo Media: libraries, media, items and watch progress' },
        ],
        components: {
          securitySchemes: {
            personalAccessToken: {
              type: 'http',
              scheme: 'bearer',
              description: 'A personal access token (`apollo_pat_…`) created in the user settings',
            },
          },
        },
        security: [{ personalAccessToken: [] }],
      },
    };
  }

  /**
   * An `onRoute` hook that fails the boot on a duplicate operation id.
   * Generated clients name their methods after it and cursors are bound to it, so a duplicate is a programming error.
   */
  static createUniqueOperationIdHook(): (route: RouteOptions) => void {
    const routesByOperationId = new Map<string, string>();

    return (route) => {
      const operationId = (route.schema as { operationId?: unknown } | undefined)?.operationId;
      // Fastify registers an automatic HEAD route with the GET route's schema
      if (typeof operationId !== 'string' || route.method === 'HEAD') {
        return;
      }

      const routeDescription = `${String(route.method)} ${route.url}`;
      const previous = routesByOperationId.get(operationId);
      if (previous != null) {
        throw new Error(`Duplicate OpenAPI operationId '${operationId}': ${previous} and ${routeDescription}`);
      }
      routesByOperationId.set(operationId, routeDescription);
    };
  }

  /** The document as served: generated from the registered routes, pruned, pretty-printed */
  static render(server: FastifyInstance): string {
    const document = this.removeUnreferencedComponentSchemas(server.swagger());
    return JSON.stringify(document, null, 2);
  }

  /**
   * The zod type provider registers every named schema twice (an `…Input` and an output variant);
   * for response-only schemas the input variant is never referenced and only clutters generated clients.
   *
   * TODO: Consider whether we can fix/improve on that in @sprax/node-framework
   */
  private static removeUnreferencedComponentSchemas(document: GeneratedDocument): GeneratedDocument {
    const schemas = document.components?.schemas;
    if (schemas == null) {
      return document;
    }

    const reachableIds = this.collectReachableSchemaIds(document, schemas);
    const keptSchemas = Object.fromEntries(Object.entries(schemas).filter(([id]) => reachableIds.has(id)));
    return { ...document, components: { ...document.components, schemas: keptSchemas } };
  }

  private static collectReachableSchemaIds(document: GeneratedDocument, schemas: Record<string, unknown>): Set<string> {
    const reachableIds = new Set<string>();
    const queue = this.findSchemaRefs({ ...document, components: { ...document.components, schemas: undefined } });

    while (queue.length > 0) {
      const id = queue.pop()!;
      if (reachableIds.has(id)) {
        continue;
      }
      reachableIds.add(id);
      queue.push(...this.findSchemaRefs(schemas[id]));
    }
    return reachableIds;
  }

  private static findSchemaRefs(value: unknown): string[] {
    return Array.from(JSON.stringify(value).matchAll(/"#\/components\/schemas\/([^"]+)"/g), (match) => match[1]!);
  }
}
