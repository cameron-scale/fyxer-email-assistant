// storage.js
// Small wrapper around expo-secure-store (the phone's encrypted keychain) so we
// can safely remember settings and tokens between app launches. Falls back to
// memory if secure store isn't available (e.g. web preview) so nothing crashes.
//
// IMPORTANT: SecureStore has a ~2048-byte limit per value on iOS. Larger values
// (our full preferences blob — signature, sender labels, notes, watched/pinned
// lists — or the cached inbox snapshot) can silently FAIL to write and be lost on
// the next launch, which is why settings sometimes "reset" after logging back in.
// To fix that, any value over the safe size is transparently split into numbered
// chunks (each well under the limit) and re-assembled on read. Small values keep
// using a single key exactly as before, so existing data still loads.

import * as SecureStore from 'expo-secure-store';

const memory = {};
const CHUNK_SIZE = 1800;             // stay comfortably under SecureStore's ~2048-byte limit
const countKey = (key) => `${key}.cn`;
const partKey = (key, i) => `${key}.c${i}`;

// Remove any chunk set previously written for this key (best-effort).
async function clearChunks(key) {
  try {
    const nRaw = await SecureStore.getItemAsync(countKey(key));
    const n = Number(nRaw);
    if (n > 0) {
      for (let i = 0; i < n; i += 1) await SecureStore.deleteItemAsync(partKey(key, i));
    }
    await SecureStore.deleteItemAsync(countKey(key));
  } catch (e) { /* nothing to clear */ }
}

export async function saveToken(key, value) {
  try {
    // Always clear any prior chunk set so we never leave stale/partial data behind.
    await clearChunks(key);
    if (value == null) {
      await SecureStore.deleteItemAsync(key);
      delete memory[key];
      return;
    }
    const str = String(value);
    if (str.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, str);
    } else {
      // Large value → split into chunks and drop the single-key copy.
      await SecureStore.deleteItemAsync(key);
      const n = Math.ceil(str.length / CHUNK_SIZE);
      for (let i = 0; i < n; i += 1) {
        await SecureStore.setItemAsync(partKey(key, i), str.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      }
      await SecureStore.setItemAsync(countKey(key), String(n));
    }
    delete memory[key];
  } catch (e) {
    // Keychain unavailable / rejected — keep it in memory so the session still works.
    memory[key] = value;
  }
}

export async function getToken(key) {
  try {
    const nRaw = await SecureStore.getItemAsync(countKey(key));
    const n = Number(nRaw);
    if (n > 0) {
      let out = '';
      for (let i = 0; i < n; i += 1) {
        const part = await SecureStore.getItemAsync(partKey(key, i));
        if (part == null) return memory[key] ?? null; // corrupt/partial — don't return garbage
        out += part;
      }
      return out;
    }
    const v = await SecureStore.getItemAsync(key);
    return v ?? memory[key] ?? null;
  } catch (e) {
    return memory[key] ?? null;
  }
}

export async function clearToken(key) {
  try {
    await clearChunks(key);
    await SecureStore.deleteItemAsync(key);
  } catch (e) {}
  delete memory[key];
}
