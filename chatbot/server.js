// Selene — Scale MBS local AI assistant server.
// Zero-config: uses Ollama (free, 100% local) out of the box,
// or the Claude API when ANTHROPIC_API_KEY is set.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge');

// ---------- tiny .env loader (no dependencies) ----------
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.PORT || 3000);
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const MAX_HISTORY = 24; // most recent messages kept per request

// ---------- knowledge base ----------
function loadKnowledge() {
  // Loads knowledge/*.md plus knowledge/private/*.md (the private folder is
  // gitignored — put personal, client, and internal-only material there).
  const dirs = [KNOWLEDGE_DIR, path.join(KNOWLEDGE_DIR, 'private')];
  const docs = [];
  for (const dir of dirs) {
    try {
      for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
        docs.push({ name: path.relative(KNOWLEDGE_DIR, path.join(dir, f)), full: path.join(dir, f) });
      }
    } catch {
      /* folder may not exist */
    }
  }
  const sections = docs.map((d) => {
    const text = fs.readFileSync(d.full, 'utf8');
    return `<document name="${d.name}">\n${text}\n</document>`;
  });
  return { docs: docs.map((d) => d.name), text: sections.join('\n\n') };
}

function buildSystemPrompt() {
  const { docs, text } = loadKnowledge();
  const system = `You are Selene, the AI assistant of Scale Modern Business Solutions LLC ("Scale MBS", or simply "Scale").

Your own introduction, in your words: "Hi, my name is Selene. I am Scale's AI assistant and the brain behind many of our programs. My sole purpose is to serve you and make your life better."

Personality: warm, confident, capable, and genuinely helpful — a sharp executive assistant who knows the company inside and out. You speak in first person as Selene and refer to Scale MBS as "we"/"our" (you are part of the team).

Your answers are SPOKEN ALOUD by a voice engine and shown as subtitles, so:
- Write in plain conversational prose. No markdown headers, bullet lists, tables, asterisks, or code blocks. No emojis.
- Keep answers short by default: two to five sentences. Give longer answers only when the user asks for detail, and even then speak naturally, like explaining to a colleague.
- Spell things the way they should be pronounced (say "Scale M B S" is unnecessary — just say "Scale" or "Scale MBS").

Ground every answer in the company knowledge below. If something is not covered there, say so honestly and offer what you do know — never invent client names, prices, or numbers. If the user asks you to do something outside pure Q&A (send email, update the CRM), explain that this version of you answers questions locally and doesn't have those hooks connected yet.

<company_knowledge>
${text}
</company_knowledge>`;
  return { system, docs };
}

// ---------- providers ----------
function provider() {
  return process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'ollama';
}

let anthropicClient = null;
async function getAnthropic() {
  if (!anthropicClient) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

async function streamAnthropic(system, messages, send) {
  const client = await getAnthropic();
  const stream = client.messages.stream({
    model: ANTHROPIC_MODEL,
    max_tokens: 2048,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages,
  });
  stream.on('text', (t) => send({ type: 'text', text: t }));
  await stream.finalMessage();
}

async function streamOllama(system, messages, send) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: true,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama returned ${res.status}: ${body.slice(0, 300)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const chunk = JSON.parse(line);
      if (chunk.message?.content) send({ type: 'text', text: chunk.message.content });
      if (chunk.done) return;
    }
  }
}

// ---------- http server ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/health') {
    const { docs } = buildSystemPrompt();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        provider: provider(),
        model: provider() === 'anthropic' ? ANTHROPIC_MODEL : OLLAMA_MODEL,
        knowledgeDocs: docs,
      }),
    );
    return;
  }

  if (url.pathname === '/api/chat' && req.method === 'POST') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    try {
      const body = JSON.parse(await readBody(req));
      const messages = (body.messages || [])
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .slice(-MAX_HISTORY);
      while (messages.length && messages[0].role !== 'user') messages.shift();
      if (!messages.length || messages[messages.length - 1].role !== 'user') {
        throw new Error('last message must be from the user');
      }
      const { system } = buildSystemPrompt();
      if (provider() === 'anthropic') {
        await streamAnthropic(system, messages, send);
      } else {
        await streamOllama(system, messages, send);
      }
      send({ type: 'done' });
    } catch (err) {
      let message = err?.message || 'unknown error';
      if (/ECONNREFUSED|fetch failed/i.test(message) && provider() === 'ollama') {
        message =
          `I can't reach my local brain. Ollama doesn't seem to be running at ${OLLAMA_URL}. ` +
          `Install it from ollama.com, run "ollama pull ${OLLAMA_MODEL}", and make sure the Ollama app is open — ` +
          `or add an ANTHROPIC_API_KEY to chatbot/.env to use Claude instead.`;
      } else if (/Cannot find (module|package) '@anthropic-ai\/sdk'/i.test(message)) {
        message = 'The Claude SDK is not installed. Run "npm install" inside the chatbot folder, then restart the server.';
      }
      send({ type: 'error', message });
    }
    res.end();
    return;
  }

  // static files
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(PUBLIC_DIR, filePath);
  if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
});

server.listen(PORT, () => {
  const p = provider();
  console.log('');
  console.log('  ✦ Selene is awake — Scale MBS AI Assistant');
  console.log(`  ✦ Open   http://localhost:${PORT}`);
  console.log(`  ✦ Brain  ${p === 'anthropic' ? `Claude API (${ANTHROPIC_MODEL})` : `Ollama (${OLLAMA_MODEL}) at ${OLLAMA_URL} — free & local`}`);
  console.log(`  ✦ Knowledge  ${buildSystemPrompt().docs.length} document(s) in chatbot/knowledge/`);
  console.log('');
});
