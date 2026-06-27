import DemoRequestForm from "./DemoRequestForm";
import { resolveProduct, productLabel, offeredProducts } from "../products";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ product?: string | string[] }>;

export default async function DemoRequestPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { product: productParam } = await searchParams;
  const requested = resolveProduct(productParam);
  // Only let customers request a demo for a product we currently offer.
  const offered = offeredProducts();
  const product = offered.includes(requested) ? requested : offered[0];

  return <DemoRequestForm product={product} productLabel={productLabel(product)} />;
}
