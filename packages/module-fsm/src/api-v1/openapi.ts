// Just this module's own `paths` fragment -- merged into the composite spec served at
// GET /api/v1/openapi.json (apps/web/app/api/v1/dispatch.ts), which owns the shared
// `info`/`components` (Error/ListMeta schemas, security scheme) every module's
// resources reuse rather than redeclaring.
export const openApiPaths = {
  "/jobs": {
    get: {
      summary: "List jobs (read-only)",
      parameters: [{ name: "status", in: "query", schema: { type: "string" } }],
      responses: { "200": { description: "OK" } },
    },
  },
  "/jobs/{id}": {
    get: { summary: "Get a job (read-only)", responses: { "200": { description: "OK" } } },
  },
};
