// Just this module's own `paths` fragment -- see module-fsm/api-v1/openapi.ts's own
// comment for why (merged into the composite spec, which owns the shared info/components).
export const openApiPaths = {
  "/einvoices": {
    get: {
      summary: "List e-invoices (read-only) -- IRN/ack/status per document",
      parameters: [
        { name: "document_id", in: "query", schema: { type: "string", format: "uuid" } },
        { name: "status", in: "query", schema: { type: "string", enum: ["generated", "cancelled"] } },
      ],
      responses: { "200": { description: "OK" } },
    },
  },
  "/einvoices/{id}": {
    get: { summary: "Get an e-invoice (read-only)", responses: { "200": { description: "OK" } } },
  },
};
