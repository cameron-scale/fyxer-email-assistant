# Pointing centurion.scalembs.com at Centurion (on your PC)

Your PC sits behind a home router (no fixed public IP), so the clean, free,
secure way to serve `centurion.scalembs.com` from it is a **Cloudflare Tunnel**.
It gives HTTPS, a stable hostname, and never exposes your PC directly.

## Important: scalembs.com is on GoDaddy, not Cloudflare
A Cloudflare Tunnel can only attach a hostname to a domain whose DNS is on
Cloudflare. So you have two real choices:

### Option 1 — Move scalembs.com's DNS to Cloudflare (recommended, free)
This is the standard setup and makes everything automatic.
1. Create a free Cloudflare account → **Add a site** → `scalembs.com`.
2. Cloudflare **auto-imports your existing GoDaddy records**. **Carefully verify**
   your website (A/CNAME) and **email (MX + any SPF/DKIM TXT)** records all came
   across — this is the one thing to get right so business email/site don't break.
3. Cloudflare gives you **two nameservers** (e.g. `xxx.ns.cloudflare.com`). In
   **GoDaddy → Domain → Nameservers**, switch to those two. (Propagates in
   minutes–hours.)
4. Then, on your PC (one-time):
   ```
   cloudflared tunnel login
   cloudflared tunnel create centurion
   cloudflared tunnel route dns centurion centurion.scalembs.com
   ```
   That **creates the DNS record for you** — you don't add anything by hand.
   (For reference, it adds a proxied CNAME: `centurion` → `<TUNNEL_ID>.cfargotunnel.com`.)
5. Run `tunnel-cloudflare.bat`. Done — `https://centurion.scalembs.com` is live.

### Option 2 — Leave DNS on GoDaddy (no free custom-domain tunnel)
Cloudflare Tunnel won't work without the zone on Cloudflare. The GoDaddy-only
options are either **paid** (ngrok custom domain) or **fragile/insecure**
(home A-record + port-forwarding). I don't recommend either.

## Honest timing note
SEO on the real domain is a **multi-week** payoff — it will not produce sales
during your vacation week regardless. So you don't have to rush the nameserver
move before you leave. A safe plan:
- **This week:** use the free `*.ngrok-free.app` static domain (zero DNS change)
  just to reach/manage the dashboard remotely. (`tunnel-ngrok.bat`)
- **When you're ready (back from vacation, unhurried):** do the Cloudflare move
  above so `centurion.scalembs.com` serves the SEO pages and starts compounding.

## After the domain is live
- `CENTURION_PUBLIC_URL=https://centurion.scalembs.com` is already set in
  `_run-dashboard.bat`, so product links, SEO internal links, the sitemap, and
  the post-payment delivery redirect all use your real domain.
- Submit `https://centurion.scalembs.com/sitemap.xml` in **Google Search Console**
  (add the domain as a property) so Google starts crawling the SEO pages.
