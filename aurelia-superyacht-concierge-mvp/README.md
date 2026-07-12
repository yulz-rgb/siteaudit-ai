# Aurelia — Superyacht Concierge Intelligence

A lightweight deployable MVP for generating UHNW superyacht concierge briefs from guest preferences and itinerary inputs.

## Deployment

Vercel deployment was created at:

https://aurelia-superyacht-concierge-3s5vfgb8r-yulzs-projects.vercel.app

I could not verify final deployment status through the Vercel connector because the `yulzs-projects` scope returned a 403 authorization error.

## Live AI mode

The API is designed to use Vercel AI Gateway. Enable AI Gateway on the Vercel project or add `AI_GATEWAY_API_KEY`. Without credentials it returns a safe setup-mode response instead of fabricating weather, events, restaurant availability or logistics.

## Full source

The full verified Next.js source package was generated separately and production-built locally. It includes richer upload handling for DOCX, XLSX/XLS, CSV, TXT, MD, JSON and PDF placeholder handling.
