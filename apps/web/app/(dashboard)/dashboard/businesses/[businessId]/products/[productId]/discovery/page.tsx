import { notFound } from "next/navigation";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { listDiscoveryDefinitions } from "@cofounderai/module-discovery/lib/discovery-definitions/queries";
import { DefinitionList } from "@cofounderai/module-discovery/components/discovery-definitions/definition-list";
import { createDefinitionAction, updateDefinitionAction, setDefinitionEnabledAction, deleteDefinitionAction } from "./actions";

export default async function DiscoveryDefinitionsPage({
  params,
}: {
  params: Promise<{ businessId: string; productId: string }>;
}) {
  const { businessId, productId } = await params;
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  const definitions = await listDiscoveryDefinitions(workspace.id);

  return (
    <DefinitionList
      definitions={definitions}
      createAction={createDefinitionAction.bind(null, businessId, productId)}
      updateAction={updateDefinitionAction.bind(null, businessId, productId)}
      setEnabledAction={setDefinitionEnabledAction.bind(null, businessId, productId)}
      deleteAction={deleteDefinitionAction.bind(null, businessId, productId)}
    />
  );
}
