import { handleApiV1Request } from "@cofounderai/module-inventory/api-v1/router";

/** GET (list) and POST (create) for a resource with no id -- e.g. /api/v1/products.
 * The [id] variants live in the sibling [resource]/[id]/route.ts. */
export async function GET(request: Request, { params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  const url = new URL(request.url);
  return handleApiV1Request(request, resource, undefined, url.searchParams);
}

export async function POST(request: Request, { params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  const url = new URL(request.url);
  return handleApiV1Request(request, resource, undefined, url.searchParams);
}
