# Brisk Backend ⚙️

This is the small server that powers **real Outlook login, AI summaries, and
sending** for the Brisk app. You deploy it once (free), paste its address into the
app's Settings, and you're done.

It keeps your secrets (Microsoft app password, Anthropic AI key) safe on the server
— they never touch your phone.

**Total setup time: ~15 minutes.** You'll need three free things: a Microsoft app
registration, an Anthropic API key, and a Render account.

---

## Step 1 — Register a Microsoft app (gets you a Client ID + Secret)

1. Go to <https://portal.azure.com> → search **"App registrations"** → **New registration**.
2. **Name:** `Brisk`. For **Supported account types**, pick
   **"Accounts in any organizational directory and personal Microsoft accounts."**
3. Skip the Redirect URI for now (we'll add it in Step 4). Click **Register**.
4. On the overview page, copy the **Application (client) ID** → this is your **`MS_CLIENT_ID`**.
5. Left menu → **Certificates & secrets** → **New client secret** → set expiry → **Add**.
   Copy the **Value** (not the ID) immediately → this is your **`MS_CLIENT_SECRET`**.
6. Left menu → **API permissions** → **Add a permission** → **Microsoft Graph** →
   **Delegated permissions** → add **`Mail.Read`**, **`Mail.Send`**, and
   **`offline_access`** (search for each, tick it, Add). `User.Read` is already there.

## Step 2 — Get an Anthropic API key (for the AI summaries/drafts)

1. Go to <https://console.anthropic.com> → **API Keys** → **Create Key**.
2. Copy it → this is your **`ANTHROPIC_API_KEY`**.
3. Add a few dollars of credit under **Billing**. (Haiku is cheap — a penny or two per
   inbox refresh.)

## Step 3 — Deploy to Render (free)

1. Go to <https://render.com>, sign up, and connect your GitHub.
2. **New → Web Service** → pick the **`fyxer-email-assistant`** repo.
3. Set:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Click **Advanced → Add Environment Variable** and add these four:

   | Key | Value |
   |---|---|
   | `MS_CLIENT_ID` | from Step 1.4 |
   | `MS_CLIENT_SECRET` | from Step 1.5 |
   | `ANTHROPIC_API_KEY` | from Step 2.2 |
   | `AI_MODEL` | `claude-haiku-4-5` |

5. **Create Web Service.** Wait for it to deploy (~2 min). Copy your URL —
   something like **`https://brisk-xxxx.onrender.com`**.
6. Visit `https://brisk-xxxx.onrender.com/health` in a browser. You should see
   `{"ok":true,"microsoft":true,"ai":true,...}`. If `microsoft` or `ai` is `false`,
   re-check that env var.

> Render's free tier "sleeps" after 15 minutes idle, so the **first** request after a
> nap takes ~30–60 seconds to wake up. That's normal. (Upgrade to a paid instance
> later if you want it always-on.)

## Step 4 — Tell Microsoft about your server's address

1. Back in Azure → your app → **Authentication** → **Add a platform** → **Web**.
2. **Redirect URI:**
   `https://brisk-xxxx.onrender.com/auth/microsoft/callback`
   (use your real Render URL). **Save.**

## Step 5 — Connect it in the app

1. Open Brisk → **gear icon** → **Settings**.
2. Paste your Render URL into **"Backend server URL"**.
3. Go to the profile/account screen → **Outlook / Microsoft 365** → **Tap to sign in**.
4. Log in with Microsoft. The app loads your real inbox, sorted by priority with
   **AI summaries**, and the **Reply** button now actually sends. 🎉

---

## Running it locally (optional, for tinkering)

```bash
cd server
npm install
MS_CLIENT_ID=... MS_CLIENT_SECRET=... ANTHROPIC_API_KEY=... npm start
```
Then expose it with a tunnel (e.g. `npx localtunnel --port 3000`) and use that URL —
or just deploy to Render, which is simpler.

## What each endpoint does

| Endpoint | Purpose |
|---|---|
| `GET /health` | Sanity check — is the server configured? |
| `GET /auth/microsoft/start` | Begins Microsoft login |
| `GET /auth/microsoft/callback` | Microsoft returns here; hands the app a refresh token |
| `POST /inbox` | Fetches your mail via Graph + adds Claude summaries |
| `POST /draft` | Writes a full AI reply in your chosen tone |
| `POST /send` | Sends a reply from your Outlook |

## Privacy & cost

- Your Microsoft secret and Anthropic key live **only** on the server (Render env vars).
- The app stores just a refresh token in your phone's encrypted keychain.
- AI cost is **Claude Haiku 4.5** — typically a cent or two per inbox refresh. Change
  the model anytime with the `AI_MODEL` env var (e.g. `claude-opus-4-8` for max quality).
