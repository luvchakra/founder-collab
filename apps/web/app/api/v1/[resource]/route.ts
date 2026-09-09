import { dispatchApiV1Request } from "../dispatch";

/** GET (list) and POST (create) for a resource with no id -- e.g. /api/v1/products.
 * The [id] variants live in the sibling [resource]/[id]/route.ts. */
export async function GET(request: Request, { params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  const url = new URL(request.url);
  return dispatchApiV1Request(request, resource, undefined, url.searchParams);
}

export async function POST(request: Request, { params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  const url = new URL(request.url);
  return dispatchApiV1Request(request, resource, undefined, url.searchParams);
}
