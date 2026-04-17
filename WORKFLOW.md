# SiteAudit AI Workflow

## Your Only Actions

1. Tell me what to build or fix.
2. When I say "ready to ship", run:
   - `npm run ship`
3. If `ship` fails, run:
   - `npm run doctor`
   - share the output with me

## What I Handle

- Code changes
- Bug fixes and refactors
- Unit tests
- Lint/build fixes
- Deployment command prep
- Clear next-step instructions

## Normal Loop

1. You request change.
2. I implement and verify with:
   - tests
   - lint
   - build
3. I tell you exactly what to run next.
4. You run one command (`npm run ship`) and confirm result.

## If Deploy Breaks

1. Run `npx vercel ls siteaudit-ai`
2. Open latest `Ready` + `Production` URL
3. Share screenshot/output and I fix forward
