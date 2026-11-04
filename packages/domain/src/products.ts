/** Fields needed to name a product the way the shelf and receipts show it. */
export interface ProductNameParts {
  brand: string;
  genericName: string;
  strength: string;
  form: string;
}

/**
 * "Biogesic 500mg Tab"; generics sold under the RiteMed label read
 * "RiteMed Paracetamol 500mg Tab" so the brand alone is not ambiguous.
 */
export function productDisplayName(product: ProductNameParts): string {
  const name = product.brand === "RiteMed" ? `RiteMed ${product.genericName}` : product.brand;
  return [name, product.strength, product.form].filter((part) => part.trim() !== "").join(" ");
}

/** Lowercased text that product search matches against: brand, generic name, SKU and strength. */
export function productSearchText(product: ProductNameParts & { sku: string }): string {
  return `${product.brand} ${product.genericName} ${product.sku} ${product.strength}`.toLowerCase();
}
