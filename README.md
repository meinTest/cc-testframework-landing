# cc-testframework-landing

Customer-facing landing page **and** the sales-vetted onboarding/delivery chain for
[cc-testframework](https://github.com/meinTest/cc-testframework) and CC-Testmanagement (cc-tmgmt).
Next.js 16 (App Router), Tailwind CSS, hosted on Vercel.

> **Start here:** [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — run, test, change, deploy
> (architecture, env vars, DRY_RUN smoke tests, file map, recipes).

## Pages

- `/` — Product overview (two cards: CC-Testframework, CC-Testmanagement), bilingual DE/EN
- `/cc-testframework` — Product detail, flag-aware "Start Trial"/"Request Demo" CTA
- `/cc-testmanagement` — Product detail (cc-tmgmt), sales-led "Request Demo" CTA (Phase 1: no self-serve trial yet)
- `/signup` — Trial signup form (POSTs to `/api/signup`)
- `/api/signup` — Real orchestration (Keygen + GitHub App + Resend)

Language is selected via the `?lang=de|en` query param (default German); see `app/content.ts`.

## Local development

```bash
npm install
npm run dev
# → http://localhost:3000
```

## Deployment

- Auto-deploy on push to `main` via Vercel
- Custom domain `cc-testframework.itsbusiness.ch` is added once the DNS CNAME is in place

## Environment variables

See `.env.example`. None are wired up in Iter 18 — they become required in Iter 19.

## Related repos

- [meinTest/cc-testframework](https://github.com/meinTest/cc-testframework) — the test framework itself
