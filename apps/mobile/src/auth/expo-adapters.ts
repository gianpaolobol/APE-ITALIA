/**
 * Device adapters for the auth ports. Not unit-tested in Node (native modules);
 * covered by typecheck and to be verified on real iOS/Android devices.
 */
import * as ExpoCrypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import type { CryptoPort, FetchPort } from './oidc';
import type { AuthDeps, BrowserPort, SecureStoragePort } from './client';

export const expoCrypto: CryptoPort = {
  getRandomBytes: n => ExpoCrypto.getRandomBytes(n),
  sha256: async data => new Uint8Array(await ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data as Uint8Array<ArrayBuffer>)),
};

const storeOptions: SecureStore.SecureStoreOptions = {
  // Keychain item never leaves this device (no iCloud backup/migration); Android uses Keystore-backed encryption.
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const expoSecureStorage: SecureStoragePort = {
  getItem: key => SecureStore.getItemAsync(key, storeOptions),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, storeOptions),
  deleteItem: key => SecureStore.deleteItemAsync(key, storeOptions),
};

export const expoBrowser: BrowserPort = {
  async openAuthSession(url, redirectUri) {
    // ASWebAuthenticationSession on iOS, Custom Tabs on Android: the system browser, never a WebView.
    const result = await WebBrowser.openAuthSessionAsync(url, redirectUri, { preferEphemeralSession: false });
    if (result.type === 'success') return { type: 'success', url: result.url };
    return { type: result.type === 'locked' ? 'locked' : result.type === 'cancel' ? 'cancel' : 'dismiss' };
  },
};

export const platformFetch: FetchPort = async (url, init) => {
  const res = await fetch(url, init);
  return { ok: res.ok, status: res.status, json: () => res.json() };
};

export const expoAuthDeps: AuthDeps = { crypto: expoCrypto, fetch: platformFetch, browser: expoBrowser, storage: expoSecureStorage };
