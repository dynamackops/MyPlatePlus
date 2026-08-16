# MyPlate+

**See your capacity. Share the load.**

MyPlate+ is a privacy-first capacity and collaborative care system for people whose responsibilities carry cognitive, emotional, physical, sensory, and social weight. It helps a person build a realistic private plate, make room without shame, and send limited support requests to a trusted circle without exposing everything they are carrying.

Built from scratch for **Hack for Humanity · Summer 2026**.

**Live app:** https://myplate-plus.jasminegm100.chatgpt.site

## What makes it Plus

- Dynamic daily capacity check-ins
- Multidimensional load instead of a one-size-fits-all task score
- A literal, responsive visual plate
- AI-assisted brain dumps with review-before-apply controls
- Make Room+ strategies: split, simplify, postpone, recover, or ask for help
- Accounts and cross-device data architecture
- Trusted circles for couples, families, households, and chosen support networks
- Pass the Plate requests with accept, decline, and alternative-support options
- Private personal plates separated from shared responsibilities
- Six accessible color themes
- A visible AI & Privacy Center
- Personal insights framed as observations, never diagnoses

## Responsible AI architecture

MyPlate+ treats AI output as a proposal, never an action.

- Private by default
- No diagnosis, treatment claims, productivity rankings, or relationship judgments
- No automatic task movement, delegation, or sharing
- Explicit review before any proposed change
- Item-level sharing rather than whole-plate access
- The recipient sees only the approved support request
- Strict structured output
- Bounded input and output
- `store: false` for model requests
- API credentials stay inside a Supabase Edge Function
- Manual app workflows continue when AI is unavailable

## Run the app

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Without environment variables the application opens on the MyPlate+ login screen with a clearly labeled interactive-demo option. This makes the hackathon experience immediately reviewable without creating an account.

## Enable real accounts

1. Create a Supabase project.
2. Apply `supabase/schema.sql` in the SQL Editor. The file includes explicit Data API grants and row-level security policies.
3. Copy `.env.example` to `.env.local`.
4. Add `NEXT_PUBLIC_SUPABASE_URL` and the **publishable** key. Never use a secret or service-role key in browser code.
5. Configure the correct Site URL and redirect URL in Supabase Auth.
6. Deploy the `plate-assistant` Edge Function and configure `OPENAI_API_KEY` as a server-side function secret.

The current Supabase platform no longer exposes all new tables through the Data API automatically. The reference schema grants only the required authenticated privileges and enables RLS on every exposed table.

## Privacy boundary

`plate_items`, `capacity_checkins`, private notes, and AI context are owner-only. A Pass the Plate action creates a separate `pass_requests` row containing only a public title, request type, optional approved note, points, and recipient. Circle membership alone never grants access to another person’s private plate.

## Commands

```bash
npm run dev
npm run build
npm run test
npm run validate:artifact
```

## Current build status

This first build includes the complete product shell, responsive plate, capacity check-in, brain-dump proposal flow, Make Room+, theme selection, Our Table, Pass the Plate, request consent controls, insights, privacy center, Supabase schema, and authenticated AI function.

Next implementation checkpoints:

- Connect UI state to live Supabase rows after project provisioning
- Add Realtime Broadcast for private circle request updates
- Add end-to-end tests against a local Supabase stack
- Add account export and deletion flows
- Complete structured user testing and accessibility audit

## Product principle

> Capacity is information. Support is consent. Neither is a measure of worth.
