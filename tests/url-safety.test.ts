import { describe, it, expect } from 'vitest';
import { isSafeTrackingUrl } from '../src/shared/utils/urlSafety';

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
