import { dispatchApiV1Request } from "../../dispatch";

/** GET (single) and PATCH (update) for a resource by id -- e.g. /api/v1/products/{id}. */
export async function GET(request: Request, { params }: { params: Promise<{ resource: string; id: string }> }) {
  const { resource, id } = await params;
  const url = new URL(request.url);
  return dispatchApiV1Request(request, resource, id, url.searchParams);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ resource: string; id: string }> }) {
  const { resource, id } = await params;
  const url = new URL(request.url);
  return dispatchApiV1Request(request, resource, id, url.searchParams);
}
