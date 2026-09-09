// Just this module's own `paths` fragment -- see module-fsm/api-v1/openapi.ts's own
// comment for why (merged into the composite spec, which owns the shared info/components).
export const openApiPaths = {
  "/tickets": {
    get: {
      summary: "List tickets (read-only)",
      parameters: [
        { name: "status", in: "query", schema: { type: "string" } },
        { name: "channel_id", in: "query", schema: { type: "string", format: "uuid" } },
      ],
      responses: { "200": { description: "OK" } },
    },
  },
  "/tickets/{id}": {
    get: { summary: "Get a ticket (read-only)", responses: { "200": { description: "OK" } } },
  },
};
