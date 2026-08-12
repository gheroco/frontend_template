import type { PortalExtension } from '@atlas/contracts';

const scriptPromises = new Map<string, Promise<void>>();

export type RemoteDescriptor = Pick<PortalExtension, 'elementName' | 'entry'>;

export async function loadRemote(descriptor: RemoteDescriptor, timeoutMilliseconds = 10_000): Promise<void> {
  const url = validateRemoteEntry(descriptor.entry.url, descriptor.entry.integrity);
  const key = `${url.href}|${descriptor.entry.integrity}`;
  let loading = scriptPromises.get(key);
  if (!loading) {
    loading = injectModule(url, descriptor.entry.integrity, descriptor.entry.crossOrigin);
    scriptPromises.set(key, loading);
  }
  try {
    await withTimeout(loading, timeoutMilliseconds, 'Remote entry timed out');
    await withTimeout(customElements.whenDefined(descriptor.elementName), timeoutMilliseconds, 'Custom element was not registered');
  } catch (error) {
    scriptPromises.delete(key);
    throw error;
  }
}

export function validateRemoteEntry(value: string, integrity: string): URL {
  if (!/^sha384-[A-Za-z0-9+/]{64}$/.test(integrity)) throw new Error('Remote entry integrity metadata is invalid');
  const url = new URL(value, window.location.origin);
  const sameOrigin = url.origin === window.location.origin;
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!sameOrigin && url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('Remote entry must use HTTPS');
  }
  return url;
}

function injectModule(url: URL, integrity: string, crossOrigin: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = url.href;
    script.integrity = integrity;
    script.crossOrigin = crossOrigin;
    script.dataset.atlasRemote = 'true';
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => {
      script.remove();
      reject(new Error('Remote entry failed security or availability checks'));
    }, { once: true });
    document.head.append(script);
  });
}

function withTimeout<T>(promise: PromiseLike<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), milliseconds);
    Promise.resolve(promise).then(
      (value) => { window.clearTimeout(timeout); resolve(value); },
      (error: unknown) => { window.clearTimeout(timeout); reject(error); }
    );
  });
}

export function resetRemoteLoaderForTests(): void {
  scriptPromises.clear();
}

