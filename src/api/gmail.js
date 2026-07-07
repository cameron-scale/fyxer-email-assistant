// gmail.js
// Fetches a batch of recent Gmail messages and converts them into the simple
// shape the rest of the app understands: { id, from, subject, body, date, read, flagged }.

const BASE = 'https://www.googleapis.com/gmail/v1/users/me';

function header(headers, name) {
  const h = (headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

export async function fetchGmail(accessToken, max = 25) {
  const auth = { Authorization: `Bearer ${accessToken}` };

  // 1) Get the list of message IDs from the inbox.
  const listRes = await fetch(
    `${BASE}/messages?maxResults=${max}&labelIds=INBOX`,
    { headers: auth }
  );
  if (!listRes.ok) throw new Error(`Gmail list failed (${listRes.status})`);
  const list = await listRes.json();
  if (!list.messages) return [];

  // 2) Fetch each message's metadata + snippet (in parallel for speed).
  const details = await Promise.all(
    list.messages.map(async (m) => {
      const res = await fetch(
        `${BASE}/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: auth }
      );
      if (!res.ok) return null;
      return res.json();
    })
  );

  return details.filter(Boolean).map((d) => ({
    id: d.id,
    account: 'gmail',
    from: header(d.payload?.headers, 'From'),
    subject: header(d.payload?.headers, 'Subject') || '(no subject)',
    body: d.snippet || '',
    date: new Date(Number(d.internalDate) || Date.now()).toISOString(),
    read: !(d.labelIds || []).includes('UNREAD'),
    flagged: (d.labelIds || []).includes('STARRED'),
  }));
}
