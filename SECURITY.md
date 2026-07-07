# Scale Mail — Security Architecture

*For family offices, law firms, and other organizations handling privileged or
NDA-protected email. Last updated: July 2026.*

## The short version

- **Your mailbox credentials never touch our servers' storage.** OAuth refresh
  tokens live only in your phone's hardware-encrypted keychain (iOS Keychain via
  Expo SecureStore). Each request carries the token; the server uses it in memory
  and does not persist it.
- **We do not run a mail database.** There is no server-side copy of your inbox.
  Mail is fetched from Microsoft/Google/Apple on demand and returned to your
  device.
- **Everything sensitive that *is* cached server-side is encrypted at rest** with
  AES-256-GCM (AI summaries and next-step hints derived from mail, and in-flight
  OAuth handoffs). No encryption key configured → nothing is written to disk at all.
- **All transport is TLS**, with HSTS enforced so connections can never downgrade
  to plain HTTP.
- **Private AI mode** (Settings → Security) stops all email content from being
  sent to the AI. Summaries, AI search, next steps, and writing help pause;
  priority scoring continues fully on-device. Built for privileged material.
- **App Lock** (Settings → Security) requires Face ID / Touch ID / passcode every
  time the app opens or returns from the background.

## Data flow, in detail

| Data | Where it lives | Protection |
|---|---|---|
| OAuth refresh tokens (Gmail/Outlook) | Device keychain only | iOS hardware encryption; never persisted server-side |
| iCloud app-specific password | Device keychain only | Same; scoped, revocable at appleid.apple.com |
| Email bodies | Your mail provider; fetched transiently | TLS in transit; never written to server disk |
| AI summaries / next-steps (derived) | Server cache | AES-256-GCM at rest, capped size, keyed to content fingerprint per user |
| Your settings, VIPs, sender labels, signature | Device keychain only | iOS hardware encryption |
| Signature photos you upload | Server (public URL required by email clients) | Unguessable random IDs; deletable in-app |
| Server logs | Server memory (last few events) | Stage names, counts and lengths only — **never** message content, subjects, or addresses |

## AI processing

When AI features are on, message content (sender, subject, body text) is sent
over TLS to our backend and then to Anthropic's Claude API to produce summaries,
next steps, search answers, and drafts. Anthropic's API does not train on this
data by default. Results are cached (encrypted) so each message is processed at
most once.

When **Private AI mode** is on, none of that happens — content stays on the
phone, and the on-device priority engine (plain code, no AI) does all ranking.

## Access controls on the backend

- **App key**: every app-to-server request must carry a shared key
  (`x-app-key`); requests without it are rejected. Browser-reachable paths are
  limited to OAuth, health, and token-gated debug pages.
- **Rate limiting**: per-IP sliding window, with a tighter ceiling on AI
  endpoints, so the API can't be scraped or the AI budget drained.
- **Debug pages**: disabled entirely unless a `DEBUG_TOKEN` is set, and 404
  without the exact token.
- **Headers**: HSTS (1 year), nosniff, frame-deny, no-referrer,
  restrictive Permissions-Policy.
- **Proxy trust** pinned to exactly one hop so client IPs can't be spoofed to
  dodge rate limits.

## What we can't see or do

- We cannot read your mailbox without your device initiating a request — tokens
  aren't stored server-side.
- We cannot recover your mail if you delete the app; nothing exists to recover.
- Disconnecting an account in the app (or revoking access at
  myaccount.google.com / account.microsoft.com / appleid.apple.com) immediately
  cuts off all access.

## Owner deployment checklist (required for the guarantees above)

Set these in the server environment (Render → Environment):

1. `SERVER_ENC_KEY` — 64-hex-char key; enables all at-rest encryption.
2. `APP_API_KEY` — shared app key; set the matching `EXPO_PUBLIC_APP_KEY` in the
   app build (EAS → Secrets) and republish.
3. `DEBUG_TOKEN` — long random string, or leave unset to disable debug pages.
4. Use a **paid Render instance** (or equivalent) for production: dedicated
   resources, no cold starts, and a persistent disk for the encrypted caches.
5. Rotate any credential that has ever been shared in chat/email.

## Roadmap for enterprise deployments

Honest notes on what a security-conscious buyer should know is *not* here yet:

- No SSO/SCIM or centralized admin console (each user connects their own mailbox).
- No server-side audit log of user actions (by design — we minimize data).
- SOC 2 / ISO 27001 attestation not yet obtained; the architecture above is
  designed to make that path straightforward.
- Anthropic zero-data-retention agreements are available on request for
  enterprise API accounts.
