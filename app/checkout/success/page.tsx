export const dynamic = "force-dynamic";

export default function CheckoutSuccessPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-24">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Vielen Dank!
        </h1>
        <p className="mt-4 text-base text-slate-600 dark:text-slate-300">
          Dein Abo ist aktiv. Wir stellen deine Lizenzschlüssel aus und senden sie
          dir per E-Mail — das kann einen kurzen Moment dauern.
        </p>
        <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
          Fragen? Schreib uns an{" "}
          <a
            href="mailto:support@meinTest.software"
            className="underline hover:text-slate-700 dark:hover:text-slate-200"
          >
            support@meinTest.software
          </a>
          .
        </p>
      </div>
    </main>
  );
}
