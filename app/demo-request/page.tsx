import DemoRequestForm from "./DemoRequestForm";
import { resolveProduct, productLabel } from "../products";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ product?: string | string[] }>;

export default async function DemoRequestPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { product: productParam } = await searchParams;
  const product = resolveProduct(productParam);

  return <DemoRequestForm product={product} productLabel={productLabel(product)} />;
}
