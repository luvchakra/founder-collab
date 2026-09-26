import { createClient } from "../../db/server";
import type { BuyerPersona } from "../personas/types";
import { accountKeyFor } from "../portfolio/accounts";
import type { Prospect } from "../prospects/types";
import { listProducts, listWorkspacesForProducts } from "../tenancy/queries";
import { findSamePersonInOtherOfferings, type OtherOfferingRole } from "./cross-offering";
import type { Contact } from "./types";

/** An exact, case-insensitive `ilike` pattern: `%`/`_`/`\` in a company name or domain
 * are matched literally, never as wildcards. */
function literalIlike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listContacts(prospectId: string): Promise<Contact[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

/**
 * DISC-OFFER-P1-04.3: the same people under this business's other offerings, with their
 * role there. Finds the same account in each other offering (the Cross-Offering Account
 * View's exact `accountKeyFor` match), then the same person by email or full name. RLS
 * scopes every read to the caller's own business.
 */
export async function getSamePersonInOtherOfferings(
  businessId: string,
  workspaceId: string,
  prospect: Pick<Prospect, "company_name" | "domain">,
  contacts: Contact[],
): Promise<Map<string, OtherOfferingRole[]>> {
  if (contacts.length === 0) return new Map();
  const products = await listProducts(businessId);
  if (products.length < 2) return new Map();
  const workspaces = (await listWorkspacesForProducts(products.map((p) => p.id))).filter((w) => w.id !== workspaceId);
  if (workspaces.length === 0) return new Map();

  const supabase = await createClient();
  const domain = prospect.domain?.trim();
  let prospectQuery = supabase
    .from("prospects")
    .select("id, workspace_id, company_name, domain")
    .in(
      "workspace_id",
      workspaces.map((w) => w.id),
    );
  prospectQuery = domain
    ? prospectQuery.ilike("domain", literalIlike(domain))
    : prospectQuery.ilike("company_name", literalIlike(prospect.company_name.trim()));
  const { data: candidates, error } = await prospectQuery;
  if (error) throw error;
  const key = accountKeyFor(prospect);
  const sameAccount = (candidates as { id: string; workspace_id: string; company_name: string; domain: string | null }[]).filter(
    (p) => accountKeyFor(p) === key,
  );
  if (sameAccount.length === 0) return new Map();

  const [contactsRes, personasRes] = await Promise.all([
    supabase
      .from("contacts")
      .select("*")
      .in(
        "prospect_id",
        sameAccount.map((p) => p.id),
      ),
    supabase
      .from("buyer_personas")
      .select("*")
      .in(
        "workspace_id",
        sameAccount.map((p) => p.workspace_id),
      ),
  ]);
  if (contactsRes.error) throw contactsRes.error;
  if (personasRes.error) throw personasRes.error;

  const productById = new Map(products.map((p) => [p.id, p] as const));
  const productByWorkspaceId = new Map(workspaces.map((w) => [w.id, productById.get(w.product_id)] as const));
  const personas = personasRes.data as BuyerPersona[];
  const elsewhere = (contactsRes.data as Contact[]).flatMap((contact) => {
    const product = productByWorkspaceId.get(contact.workspace_id);
    if (!product) return [];
    return [{ contact, productId: product.id, productName: product.name, personas: personas.filter((p) => p.workspace_id === contact.workspace_id) }];
  });

  return findSamePersonInOtherOfferings(contacts, elsewhere);
}
