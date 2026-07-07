// outlook.js
// Fetches recent Outlook / Microsoft 365 mail via Microsoft Graph and normalizes
// it into the same simple shape the app uses everywhere.

const BASE = 'https://graph.microsoft.com/v1.0/me';

export async function fetchOutlook(accessToken, max = 25) {
  const url =
    `${BASE}/messages?$top=${max}` +
    `&$select=subject,from,bodyPreview,receivedDateTime,isRead,flag` +
    `&$orderby=receivedDateTime desc`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Outlook fetch failed (${res.status})`);
  const data = await res.json();
  if (!data.value) return [];

  return data.value.map((m) => ({
    id: m.id,
    account: 'outlook',
    from: m.from?.emailAddress
      ? `${m.from.emailAddress.name} <${m.from.emailAddress.address}>`
      : '',
    subject: m.subject || '(no subject)',
    body: m.bodyPreview || '',
    date: m.receivedDateTime || new Date().toISOString(),
    read: !!m.isRead,
    flagged: m.flag?.flagStatus === 'flagged',
  }));
}
