import { describe, it, expect } from 'vitest';
import { addressStorageKey } from '../src/features/addresses/state/addressStore';

describe('addressStorageKey (Loop 36/120)', () => {
  it('scopes keys per user id', () => {
    expect(addressStorageKey('burg.addresses', 'u1')).toBe('burg.addresses::u1');
    expect(addressStorageKey('burg.addresses', 'u1')).not.toBe(
      addressStorageKey('burg.addresses', 'u2')
    );
  });

  it('keeps guests on the legacy key without migrating anyone', () => {
    expect(addressStorageKey('burg.addresses', null)).toBe('burg.addresses');
    expect(addressStorageKey('burg.addresses', undefined)).toBe('burg.addresses');
  });
});
