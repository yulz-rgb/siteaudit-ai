# SiteAudit AI

Production-ready MVP SaaS for AI-powered homepage conversion audits.

## Run locally

1. Install dependencies:
   - `npm install`
2. Install Playwright browser:
   - `npx playwright install chromium`
3. Copy env file:
   - `cp .env.example .env.local`
4. Add keys in `.env.local`:
   - `OPENAI_API_KEY`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PRICE_ID`
   - `NEXT_PUBLIC_APP_URL`
   - Optional: `ANTHROPIC_API_KEY`
5. Start:
   - `npm run dev`

## Deploy fast

- Validate all checks:
  - `npm run validate`
- Run local doctor:
  - `npm run doctor`
- Run full preflight:
  - `npm run preflight`
- Deploy preview:
  - `npm run preview`
- Deploy production:
  - `npm run ship`

### One-time Vercel setup checklist

- Project linked (`npx vercel link`)
- Git repo connected in Vercel
- Env vars set in Vercel for Production and Preview:
  - `OPENAI_API_KEY`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_PRICE_ID`
  - `NEXT_PUBLIC_APP_URL`
  - Optional: `ANTHROPIC_API_KEY`

## Team workflow

- Read `WORKFLOW.md` for the minimal "you do / I do" loop.
- CI is automated via `.github/workflows/ci.yml` on PRs and pushes to `main`.

## Hooks for future extensions

- Competitor comparison hook: extend `lib/scrape.ts` with multi-page scraping.
- AI rewrite hook: add action route for copy rewrite suggestions.
- Niche templates hook: add prompt presets by vertical before `generateAudit`.
