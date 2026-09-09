import { serveOpenApiSpec } from "../dispatch";

/** Unauthenticated, like any API's own documentation -- served at a literal path
 * segment ("openapi.json"), which Next.js resolves ahead of the sibling [resource]
 * dynamic route. */
export async function GET() {
  return serveOpenApiSpec();
}
