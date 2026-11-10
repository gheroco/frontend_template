import { readStorage, writeStorage } from './core.mjs';
const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
let enabled = !query?.matches && readStorage('evolution-motion', true) !== false;
const listeners = new Set();
export const motionEnabled = () => enabled;
export function subscribeMotion(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function setMotion(value) {
  enabled = Boolean(value); writeStorage('evolution-motion', enabled);
  if (typeof document !== 'undefined') document.documentElement.dataset.motion = enabled ? 'on' : 'off';
  listeners.forEach(fn => fn(enabled));
}
query?.addEventListener('change', e => { if (e.matches) setMotion(false); });
if (typeof document !== 'undefined') document.documentElement.dataset.motion = enabled ? 'on' : 'off';
