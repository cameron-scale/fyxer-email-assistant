// authConfig.js
// ─────────────────────────────────────────────────────────────────────────────
// THIS IS THE ONLY FILE YOU NEED TO EDIT TO TURN ON REAL LOGINS.
// Until you fill these in, the app runs in "Demo" mode with sample emails so you
// can test the experience on Expo Go right away.
//
// HOW TO GET THE IDs (one-time, ~10 min each). Full walkthrough in README.md:
//
//  GMAIL  -> Google Cloud Console -> create OAuth client (type: iOS/“Mobile”)
//            Paste the client id below as GOOGLE_CLIENT_ID.
//  OUTLOOK-> Azure Portal -> App registrations -> new public client (mobile)
//            Paste the Application (client) ID below as MICROSOFT_CLIENT_ID.
//  ICLOUD -> Apple has no email login API. See README "Why iCloud is different".
// ─────────────────────────────────────────────────────────────────────────────

export const GOOGLE_CLIENT_ID = ''; // e.g. '1234-abcd.apps.googleusercontent.com'
export const MICROSOFT_CLIENT_ID = ''; // e.g. 'ecf692e9-....'

// Scopes = "what the app is allowed to do". We only ask to READ mail + your name.
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'openid',
  'profile',
  'email',
];

export const MICROSOFT_SCOPES = ['User.Read', 'Mail.Read', 'offline_access'];

export const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

export const MICROSOFT_DISCOVERY = {
  authorizationEndpoint:
    'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
};

// Helper used across the app to know if a provider is ready for real login.
export const isConfigured = {
  google: () => GOOGLE_CLIENT_ID.trim().length > 0,
  microsoft: () => MICROSOFT_CLIENT_ID.trim().length > 0,
  // iCloud always needs a backend (see README), so it's never "configured" here.
  icloud: () => false,
};
