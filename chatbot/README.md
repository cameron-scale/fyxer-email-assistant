# Selene — Scale MBS AI Assistant (Local)

Selene is Scale Modern Business Solutions' AI assistant, moved off Zapier and onto your own machine. You can **watch her talk** — her avatar video plays while she speaks, with live word-synced subtitles — and her brain runs locally against a company knowledge base.

![Selene](public/selene-poster.jpg)

## What's inside

| Piece | How it works |
|---|---|
| **Face** | Your Selene avatar videos, re-encoded as seamless loops. She animates while speaking and pauses when idle. |
| **Voice** | Browser-native speech synthesis — free, offline, no API. Pick her voice from the dropdown (it's saved). |
| **Subtitles** | Rendered live, synced word-by-word to her speech, styled like the original Selene clips. |
| **Brain** | `knowledge/*.md` is loaded into the system prompt of either **Ollama** (free, 100% local) or the **Claude API** (best quality). |
| **Knowledge** | Markdown files covering the company, services, team, sales playbook, and tool stack. Edit or add files — changes apply on the next message, no restart needed. |

## Quick start

You need [Node.js 18+](https://nodejs.org). Then pick a brain:

### Option A — 100% free & local (Ollama)

1. Install [Ollama](https://ollama.com) and open it.
2. In a terminal: `ollama pull llama3.2`
3. From this folder: `node server.js`
4. Open **http://localhost:3000** and click *Talk to Selene*.

No API key, no internet required after setup, nothing leaves your machine.

### Option B — Claude API (smarter answers)

1. From this folder: `npm install`
2. Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY=sk-ant-...`
   (get a key at [console.anthropic.com](https://console.anthropic.com))
3. `node server.js` → open **http://localhost:3000**

The server picks Claude automatically whenever a key is present, otherwise it falls back to Ollama. The status pill in the header shows which brain is live.

## Teaching Selene more

Drop any `.md` (or edit the existing ones) into `chatbot/knowledge/`. Everything in that folder is loaded into her context on every message.

### Private knowledge (`knowledge/private/`)

**This repo is public**, so anything personal or internal goes in `chatbot/knowledge/private/` — Selene loads it exactly like the rest, but `.gitignore` keeps it off GitHub. Use it for: team details, client engagements and pricing, sales scripts, infrastructure notes, and personal preferences. Good additions:

- The full cold-call script, objection handling guide, and outreach templates
- Pricing / package sheets
- Exported proposals and onboarding decks (as markdown/text)

## Using her for marketing

The whole app is a self-contained page — run it on a laptop at a booth or screen-record her answering questions for social clips. To embed her on scalembs.com later, the same `public/` UI can point at a hosted copy of `server.js` (the only server-side secret is the optional Anthropic key).

## Config (`.env`)

| Variable | Default | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Presence switches the brain to Claude |
| `ANTHROPIC_MODEL` | `claude-opus-4-8` | |
| `OLLAMA_URL` | `http://localhost:11434` | |
| `OLLAMA_MODEL` | `llama3.2` | Any model you've pulled works |
| `PORT` | `3000` | |
