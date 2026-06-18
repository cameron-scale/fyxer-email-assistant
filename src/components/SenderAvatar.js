// SenderAvatar.js — shows the sender's real logo/icon when we can find one,
// falling back to the colored monogram. We derive the icon from the sender's
// email domain via a free favicon service (great for LinkedIn, Facebook, banks,
// companies). For generic consumer mailboxes (gmail/outlook/icloud/…) the domain
// icon would just be the provider logo, not the person — so we keep the monogram.

import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

// Mail providers whose favicon isn't the actual sender — keep the monogram.
const GENERIC = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'msn.com', 'icloud.com', 'me.com', 'mac.com', 'yahoo.com', 'ymail.com',
  'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'zoho.com',
]);

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function domainFor(email = '') {
  const at = String(email).toLowerCase().split('@')[1];
  if (!at) return '';
  const d = at.trim().replace(/^.*?</, '').replace(/>.*$/, '');
  return GENERIC.has(d) ? '' : d;
}

// DuckDuckGo's favicon service: free, no key, returns a clean square icon or a
// transparent placeholder. We treat a load error as "no logo" → monogram.
const iconUrl = (domain) => `https://icons.duckduckgo.com/ip3/${domain}.ico`;

export default function SenderAvatar({ name, email, size = 32, textStyle, wrapStyle }) {
  const [failed, setFailed] = useState(false);
  const domain = domainFor(email);
  const showLogo = domain && !failed;

  const dim = { width: size, height: size, borderRadius: size / 2 };

  if (showLogo) {
    return (
      <View style={[styles.logoWrap, dim]}>
        <Image
          source={{ uri: iconUrl(domain) }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          onError={() => setFailed(true)}
          resizeMode="cover"
        />
      </View>
    );
  }

  return (
    <View style={[styles.monogram, dim, wrapStyle]}>
      <Text style={[styles.text, textStyle]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  logoWrap: { backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  monogram: { backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: -0.5 },
});
