// storage.js
// Small wrapper around expo-secure-store (the phone's encrypted keychain) so we
// can safely remember access tokens between app launches. Falls back to memory
// if secure store isn't available (e.g. web preview) so nothing crashes.

import * as SecureStore from 'expo-secure-store';

const memory = {};

export async function saveToken(key, value) {
  try {
    if (value == null) {
      await SecureStore.deleteItemAsync(key);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  } catch (e) {
    memory[key] = value;
  }
}

export async function getToken(key) {
  try {
    const v = await SecureStore.getItemAsync(key);
    return v ?? memory[key] ?? null;
  } catch (e) {
    return memory[key] ?? null;
  }
}

export async function clearToken(key) {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (e) {}
  delete memory[key];
}
