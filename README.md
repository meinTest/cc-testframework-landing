# cc-testframework-landing

Customer-facing landing page for [cc-testframework](https://github.com/meinTest/cc-testframework).
Next.js 15 (App Router), Tailwind CSS, hosted on Vercel.

## Pages

- `/` — Hero + CTA "Start Trial"
- `/signup` — Trial signup form (POSTs to `/api/signup`)
- `/api/signup` — Backend stub (Iter 18). Real orchestration (Keygen + GitHub App + Resend) lands in Iter 19.

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
