// useProviders.js
// Sets up the "Sign in with Google / Microsoft" flows using expo-auth-session.
//
// Beginner note: OAuth is just the polite handshake where you log in on Google's
// or Microsoft's own page, and they hand our app a temporary "access token" that
// lets us READ your mail. We never see your password.
//
// This hook returns:
//   connectGoogle()  -> opens the Google login page, resolves to an access token
//   connectMicrosoft() -> same for Microsoft
// If a provider hasn't been configured in authConfig.js, the connect function
// throws a friendly error instead of crashing.

import { useMemo } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import {
  GOOGLE_CLIENT_ID,
  MICROSOFT_CLIENT_ID,
  GOOGLE_SCOPES,
  MICROSOFT_SCOPES,
  GOOGLE_DISCOVERY,
  MICROSOFT_DISCOVERY,
  isConfigured,
} from './authConfig';

// Required so the login popup closes cleanly when it returns to the app.
WebBrowser.maybeCompleteAuthSession();

export function useProviders() {
  const redirectUri = useMemo(
    () => AuthSession.makeRedirectUri({ scheme: 'brisk', path: 'redirect' }),
    []
  );

  // We build the auth request imperatively so we can simply `await` a token.
  async function exchange(discovery, clientId, code, codeVerifier) {
    const res = await AuthSession.exchangeCodeAsync(
      {
        clientId,
        code,
        redirectUri,
        extraParams: codeVerifier ? { code_verifier: codeVerifier } : {},
      },
      discovery
    );
    return res.accessToken;
  }

  async function connect(provider) {
    const cfg =
      provider === 'google'
        ? {
            ready: isConfigured.google(),
            clientId: GOOGLE_CLIENT_ID,
            scopes: GOOGLE_SCOPES,
            discovery: GOOGLE_DISCOVERY,
            extraParams: { access_type: 'offline', prompt: 'consent' },
          }
        : {
            ready: isConfigured.microsoft(),
            clientId: MICROSOFT_CLIENT_ID,
            scopes: MICROSOFT_SCOPES,
            discovery: MICROSOFT_DISCOVERY,
            extraParams: { prompt: 'select_account' },
          };

    if (!cfg.ready) {
      throw new Error('not-configured');
    }

    const request = new AuthSession.AuthRequest({
      clientId: cfg.clientId,
      scopes: cfg.scopes,
      redirectUri,
      usePKCE: true,
      extraParams: cfg.extraParams,
    });
    await request.makeAuthUrlAsync(cfg.discovery);
    const result = await request.promptAsync(cfg.discovery);

    if (result.type !== 'success' || !result.params.code) {
      throw new Error('cancelled');
    }
    return exchange(
      cfg.discovery,
      cfg.clientId,
      result.params.code,
      request.codeVerifier
    );
  }

  return {
    redirectUri,
    connectGoogle: () => connect('google'),
    connectMicrosoft: () => connect('microsoft'),
  };
}
