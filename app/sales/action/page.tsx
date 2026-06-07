import { verifyActionToken } from "../../api/sales/lib/action-token";
import ActionConfirm from "./ActionConfirm";

export const dynamic = "force-dynamic";

interface ActionPageProps {
  searchParams: Promise<{ t?: string }>;
}

export default async function SalesActionPage({ searchParams }: ActionPageProps) {
  const { t } = await searchParams;

  if (!t) {
    return (
      <ActionError
        title="Missing action link"
        body="This page requires an action token in the URL. Open the link from the demo-request notification email."
      />
    );
  }

  const verified = verifyActionToken(t);
  if (!verified.ok) {
    const title =
      verified.reason === "expired"
        ? "Action link expired"
        : "Invalid action link";
    const body =
      verified.reason === "expired"
        ? "This action link has expired. Open a fresh notification email or issue the token via the /sales console."
        : "We could not verify this action link. Open a fresh notification email or issue the token via the /sales console.";
    return <ActionError title={title} body={body} />;
  }

  return <ActionConfirm token={t} payload={verified.payload} />;
}

function ActionError({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-24">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
          {title}
        </h1>
        <p className="mt-4 text-base text-slate-600 dark:text-slate-300">
          {body}
        </p>
        <a
          href="/sales"
          className="mt-8 inline-flex items-center justify-center rounded-md bg-slate-900 px-6 py-3 text-base font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          Open sales console
        </a>
      </div>
    </main>
  );
}
