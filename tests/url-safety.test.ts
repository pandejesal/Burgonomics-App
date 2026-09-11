import { describe, it, expect } from 'vitest';
import { isSafeTrackingUrl, isSafeTelNumber, isSafeEmail } from '../src/shared/utils/urlSafety';

describe('isSafeTrackingUrl (Loop 18/120)', () => {
  it('allows porter.in tracking links', () => {
    expect(isSafeTrackingUrl('https://porter.in/track/ABC123')).toBe(true);
    expect(isSafeTrackingUrl('https://track.porter.in/o/1')).toBe(true);
  });

  it('rejects phishing shapes and non-https', () => {
    expect(isSafeTrackingUrl('https://porter.in.evil.com/track/1')).toBe(false);
    expect(isSafeTrackingUrl('https://evil.com/porter.in/track/1')).toBe(false);
    expect(isSafeTrackingUrl('http://porter.in/track/1')).toBe(false);
    expect(isSafeTrackingUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeTrackingUrl('')).toBe(false);
    expect(isSafeTrackingUrl('https://porter.in/track/1" onmouseover="x')).toBe(false);
  });
});

describe('isSafeTelNumber (Loop 19/120)', () => {
  it('allows ordinary dialable numbers', () => {
    expect(isSafeTelNumber('+91 98765 43210')).toBe(true);
    expect(isSafeTelNumber('09876543210')).toBe(true);
  });

  it('rejects non-dialable and absurd values', () => {
    expect(isSafeTelNumber('+911****3123')).toBe(false);
    expect(isSafeTelNumber('12345')).toBe(false);
    expect(isSafeTelNumber('')).toBe(false);
    expect(isSafeTelNumber('tel:1234')).toBe(false);
  });
});

describe('isSafeEmail (Loop 20/120)', () => {
  it('allows ordinary addresses', () => {
    expect(isSafeEmail('care@burgonomics.com')).toBe(true);
  });

  it('rejects malformed and fixture domains', () => {
    expect(isSafeEmail('support@burgonomics.example')).toBe(false);
    expect(isSafeEmail('a@example.com')).toBe(false);
    expect(isSafeEmail('not-an-email')).toBe(false);
    expect(isSafeEmail('')).toBe(false);
  });
});
