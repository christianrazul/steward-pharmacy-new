import { sql } from "drizzle-orm";
import { manilaToday, productDisplayName, type ProductSearchQuery } from "@steward/domain";
import type { ProductLookup, ProductSearchResult } from "@steward/domain/view-models";
import { rows } from "@steward/db";

import { authorize, requireUser, canAccessBranch } from "../auth/permissions";
import { forbidden } from "../http/errors";
import type { ServiceContext } from "./context";
import { productMatches } from "./sql-helpers";

interface ProductRow {
  id: string;
  sku: string;
  generic_name: string;
  brand: string;
  strength: string;
  form: string;
  category: string;
  price_centavos: number;
  is_taxable: boolean;
}

/** POS search: products carried at the branch, with sellable stock (not expired). */
export async function searchProducts(
  ctx: ServiceContext,
  query: ProductSearchQuery,
): Promise<ProductSearchResult> {
  authorize(ctx.actor, "pos.sell", { branchId: query.branchId });
  const today = manilaToday(ctx.now());
  const products = await rows<ProductRow & { sellable: number; total: number }>(
    ctx.db,
    sql`with stock as (
          select product_id, coalesce(sum(on_hand) filter (where expiry_date > ${today}::date), 0)::int as sellable
          from batch_on_hand where branch_id = ${query.branchId} group by product_id
        )
        select p.id, p.sku, p.generic_name, p.brand, p.strength, p.form, p.category, p.price_centavos::float8 as price_centavos,
               p.is_taxable, s.sellable, count(*) over()::int as total
        from products p join stock s on s.product_id = p.id
        where p.deleted_at is null and p.active
          and (${query.category} = '' or p.category = ${query.category})
          and ${productMatches(query.q)}
        order by (s.sellable > 0) desc, p.sku
        limit ${query.limit}`,
  );
  const categories = await rows<{ category: string; count: number }>(
    ctx.db,
    sql`select p.category, count(*)::int as count
        from products p
        where p.deleted_at is null and p.active
          and exists (select 1 from batches b where b.product_id = p.id and b.branch_id = ${query.branchId} and b.deleted_at is null)
        group by p.category order by count desc, p.category`,
  );
  return {
    total: products[0]?.total ?? 0,
    categories,
    products: products.map((row) => ({
      id: row.id,
      sku: row.sku,
      name: productDisplayName({
        brand: row.brand,
        genericName: row.generic_name,
        strength: row.strength,
        form: row.form,
      }),
      genericName: row.generic_name,
      brand: row.brand,
      strength: row.strength,
      form: row.form,
      category: row.category,
      priceCentavos: row.price_centavos,
      isTaxable: row.is_taxable,
      sellable: row.sellable,
    })),
  };
}

/** Product picker for Add stock and stock requests: any active product, with on hand at a branch. */
export async function lookupProducts(
  ctx: ServiceContext,
  query: { q: string; branchId: string | null; limit: number },
): Promise<ProductLookup[]> {
  const user = requireUser(ctx.actor);
  if (query.branchId !== null && !canAccessBranch(user, query.branchId))
    throw forbidden("You can only work with your own branch.");
  if (query.q.trim() === "") return [];
  const result = await rows<ProductRow & { on_hand: number | null }>(
    ctx.db,
    sql`select p.id, p.sku, p.generic_name, p.brand, p.strength, p.form, p.category, p.price_centavos::float8 as price_centavos, p.is_taxable,
               poh.on_hand
        from products p
        left join product_on_hand poh on poh.product_id = p.id and poh.branch_id = ${query.branchId}
        where p.deleted_at is null and p.active and ${productMatches(query.q)}
        order by p.sku limit ${query.limit}`,
  );
  return result.map((row) => ({
    id: row.id,
    sku: row.sku,
    name: productDisplayName({
      brand: row.brand,
      genericName: row.generic_name,
      strength: row.strength,
      form: row.form,
    }),
    genericName: row.generic_name,
    priceCentavos: row.price_centavos,
    isTaxable: row.is_taxable,
    onHand: row.on_hand,
  }));
}
