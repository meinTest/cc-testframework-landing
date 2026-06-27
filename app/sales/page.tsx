import SalesIssueForm from "./SalesIssueForm";
import { offeredProducts, PRODUCT_LABELS } from "../products";

export const dynamic = "force-dynamic";

export default function SalesPage() {
  const products = offeredProducts().map((id) => ({
    id,
    label: PRODUCT_LABELS[id],
  }));
  return <SalesIssueForm products={products} />;
}
