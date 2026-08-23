import DemoRequestForm from "./DemoRequestForm";
import { resolveProduct, productLabel, offeredProducts } from "../products";
import { content, resolveLang } from "../content";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  product?: string | string[];
  lang?: string | string[];
}>;

export default async function DemoRequestPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { product: productParam, lang: langParam } = await searchParams;
  const requested = resolveProduct(productParam);
  // Only let customers request a demo for a product we currently offer.
  const offered = offeredProducts();
  const product = offered.includes(requested) ? requested : offered[0];
  const copy = content[resolveLang(langParam)].demoRequest;

  return (
    <DemoRequestForm
      product={product}
      productLabel={productLabel(product)}
      copy={copy}
    />
  );
}
