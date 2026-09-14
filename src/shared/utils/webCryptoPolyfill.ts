/**
 * Web Crypto API polyfill for Android WebView < 105 (API < 30).
 * Provides `crypto.subtle` shim if missing so any downstream code
 * using Web Crypto encryption/decryption doesn't crash.
 * Only loaded in Capacitor native context.
 */

if (typeof window !== 'undefined' && window.crypto && !window.crypto.subtle) {
  // Minimal no-op shim — logs warning, returns rejected promises
  // rather than crashing. Real encryption should happen server-side.
  // Use Object.defineProperty since crypto.subtle is read-only
  const warnLogged = new Set<string>();
  const shim = {
    encrypt: async (_algo: any, _key: any, _data: any) => {
      const msg = 'crypto.subtle.encrypt called but Web Crypto not available; use server-side encryption';
      if (!warnLogged.has('encrypt')) { console.warn(msg); warnLogged.add('encrypt'); }
      throw new DOMException(msg, 'NotSupportedError');
    },
    decrypt: async (_algo: any, _key: any, _data: any) => {
      const msg = 'crypto.subtle.decrypt called but Web Crypto not available; use server-side encryption';
      if (!warnLogged.has('decrypt')) { console.warn(msg); warnLogged.add('decrypt'); }
      throw new DOMException(msg, 'NotSupportedError');
    },
    sign: async (_algo: any, _key: any, _data: any) => {
      const msg = 'crypto.subtle.sign called but Web Crypto not available';
      if (!warnLogged.has('sign')) { console.warn(msg); warnLogged.add('sign'); }
      throw new DOMException(msg, 'NotSupportedError');
    },
    verify: async (_algo: any, _key: any, _sig: any, _data: any) => {
      const msg = 'crypto.subtle.verify called but Web Crypto not available';
      if (!warnLogged.has('verify')) { console.warn(msg); warnLogged.add('verify'); }
      return false;
    },
    digest: async (_algo: string, _data: any) => {
      const msg = 'crypto.subtle.digest called but Web Crypto not available';
      if (!warnLogged.has('digest')) { console.warn(msg); warnLogged.add('digest'); }
      throw new DOMException(msg, 'NotSupportedError');
    },
    generateKey: async (_algo: any, _extractable: boolean, _usages: any) => {
      const msg = 'crypto.subtle.generateKey called but Web Crypto not available';
      if (!warnLogged.has('generateKey')) { console.warn(msg); warnLogged.add('generateKey'); }
      throw new DOMException(msg, 'NotSupportedError');
    },
    deriveKey: async (_algo: any, _baseKey: any, _derivedKeyType: any, _extractable: boolean, _usages: any) => {
      const msg = 'crypto.subtle.deriveKey called but Web Crypto not available';
      if (!warnLogged.has('deriveKey')) { console.warn(msg); warnLogged.add('deriveKey'); }
      throw new DOMException(msg, 'NotSupportedError');
    },
    deriveBits: async (_algo: any, _baseKey: any, _length: number) => {
      const msg = 'crypto.subtle.deriveBits called but Web Crypto not available';
      if (!warnLogged.has('deriveBits')) { console.warn(msg); warnLogged.add('deriveBits'); }
      throw new DOMException(msg, 'NotSupportedError');
    },
    importKey: async (_format: string, _keyData: any, _algorithm: any, _extractable: boolean, _usages: any) => {
      const msg = 'crypto.subtle.importKey called but Web Crypto not available';
      if (!warnLogged.has('importKey')) { console.warn(msg); warnLogged.add('importKey'); }
      throw new DOMException(msg, 'NotSupportedError');
    },
    exportKey: async (_format: string, _key: any) => {
      const msg = 'crypto.subtle.exportKey called but Web Crypto not available';
      if (!warnLogged.has('exportKey')) { console.warn(msg); warnLogged.add('exportKey'); }
      throw new DOMException(msg, 'NotSupportedError');
    },
    wrapKey: async (_format: string, _key: any, _wrappingKey: any, _algorithm: any) => {
      const msg = 'crypto.subtle.wrapKey called but Web Crypto not available';
      if (!warnLogged.has('wrapKey')) { console.warn(msg); warnLogged.add('wrapKey'); }
      throw new DOMException(msg, 'NotSupportedError');
    },
    unwrapKey: async (_format: string, _wrappedKey: any, _unwrappingKey: any, _algorithm: any, _unwrappedKeyAlgorithm: any, _extractable: boolean, _usages: any) => {
      const msg = 'crypto.subtle.unwrapKey called but Web Crypto not available';
      if (!warnLogged.has('unwrapKey')) { console.warn(msg); warnLogged.add('unwrapKey'); }
      throw new DOMException(msg, 'NotSupportedError');
    },
  };
  Object.defineProperty(window.crypto, 'subtle', {
    value: shim,
    writable: false,
    configurable: true,
  });
  console.info('[WebCryptoPolyfill] crypto.subtle shim installed (no-op; server-side encryption recommended)');
}

// Re-export for clarity
export {};