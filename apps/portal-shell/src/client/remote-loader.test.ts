// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { resetRemoteLoaderForTests, validateRemoteEntry } from './remote-loader.js';

afterEach(() => resetRemoteLoaderForTests());

describe('remote entry security validation', () => {
  it('accepts same-origin and loopback development entries with SHA-384', () => {
    const integrity = `sha384-${'A'.repeat(64)}`;
    expect(validateRemoteEntry('/extensions/inventory/entry.js', integrity).origin).toBe(window.location.origin);
    expect(validateRemoteEntry('http://localhost:4201/mfe/entry.js', integrity).hostname).toBe('localhost');
  });

  it('rejects insecure non-loopback origins before injecting a script', () => {
    expect(() => validateRemoteEntry('http://remote.example/entry.js', `sha384-${'A'.repeat(64)}`)).toThrow(/HTTPS/);
  });

  it('rejects missing or downgraded integrity metadata', () => {
    expect(() => validateRemoteEntry('/entry.js', 'sha256-not-enough')).toThrow(/integrity/);
  });
});

