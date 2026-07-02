# Growth module — organic, zero-paid-spend distribution

Drives traffic to live product listings using SEO (primary) and other organic
channels, under the existing Decision Core, guardrails, velocity caps, kill
switch, and SMS/dashboard approvals. **Zero paid spend, ever.**

## Two lanes (every action is labeled)
- **Lane A — autonomous** (owned infrastructure, can't ban an identity): SEO
  pages on owned pages, on-page SEO (titles, meta, headers, schema, canonicals,
  internal links), `sitemap.xml` / `robots.txt`, marketplace structured fields.
  Centurion publishes these directly.
- **Lane B — draft & approve** (third-party identities that can be suspended):
  Reddit/Quora/forum replies, short-form video scripts, creator/newsletter
  outreach. Centurion writes the full draft and **queues it for one-tap
  approval — it never auto-posts.** If it can't confidently place an action in
  Lane A, it's Lane B.

## What it does each cycle
1. **Keyword map** from each product's job-to-be-done across 5 intents (problem,
   comparison, alternative, best-for, how-to), EV-scored (intent × ease).
2. **Page factory (Lane A):** publishes one quality page per cycle (comparison /
   roundup / problem-solution / glossary / use-case) with schema, canonical, a
   meta description, and an internal link to the product. Quality floor: a page
   that's useless even if it ranked is rejected.
3. **Lane B drafts:** community replies, faceless video scripts, outreach pitches
   → queued for approval (shown in the dashboard's "Lane B" panel; SMS alert).
4. **Measurement:** per-page views + click-throughs to the product (Thompson
   sampling over content templates — content arms, not ad arms).

## Enforced guardrails (on every asset)
- **No income/earnings/results claims** (incl. implied) — pattern-blocked.
- **No fabricated reviews/ratings/social-proof/user counts** — pattern-blocked.
- **No near-duplicate mass content** — Jaccard de-dup vs published pages.
- Non-compliant content is sanitized once, then **refused** if still failing.
- Paused / heartbeat-missed → **Lane A stops publishing, queue only.**

## The honest dependencies (please read)
- **SEO needs a real domain.** A tunnel URL (trycloudflare / ngrok) won't rank
  and isn't stable. Point a cheap real domain at the dashboard for SEO to count.
  The pages, sitemap, schema, and internal links are all built and served now —
  ranking is on Google's clock.
- **SEO compounds over weeks, not days.** Don't expect week-one sales from it.
- **Keyword scoring is heuristic** (no paid volume API). `KeywordPlanner` has a
  `volume_fn` hook to plug in real data later.
- **Lane B is the fast lane** but requires your taps. Approve drafts from your
  phone; that's the human gate that keeps identities off ban lists.

## Where to see it
Dashboard → **Growth** panel (pages / views / clicks) and **Lane B** panel
(drafts with Approve / Reject). Pages serve at `/c/<slug>`, click-throughs at
`/go/<slug>`, plus `/sitemap.xml` and `/robots.txt`.
