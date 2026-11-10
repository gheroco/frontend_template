// Deterministic SI models shared by the displays and numerical tests.
export const H = 6.62607015e-34;
export const C = 299792458;
export const E_CHARGE = 1.602176634e-19;
export function wave({ x, t, amplitude = 1, frequency = 1, speed = 4 }) {
  return amplitude * Math.sin(2 * Math.PI * frequency * (x / speed - t));
}
export function wavelength(frequency, speed = 4) { return speed / frequency; }
export function relativeVelocity(objectVelocity, frameVelocity) { return objectVelocity - frameVelocity; }
export function photoelectric(wavelengthNm, workFunctionEv = 2.3) {
  const energyEv = H * C / (wavelengthNm * 1e-9 * E_CHARGE);
  return { energyEv, kineticEv: Math.max(0, energyEv - workFunctionEv), emits: energyEv > workFunctionEv, thresholdNm: H * C / (workFunctionEv * E_CHARGE) * 1e9 };
}
export function gamma(beta) {
  if (!Number.isFinite(beta) || Math.abs(beta) >= 1) throw new RangeError('|v/c| must be below 1');
  return 1 / Math.sqrt(1 - beta * beta);
}
export function fallDistance(t, acceleration = 9.81) { return 0.5 * acceleration * t * t; }
// Point charges in dimensionless coordinates; magnitudes are normalized for rendering.
// The exclusion radius is a visualization boundary, not a softened physical field.
export function electricField(x, y, rightCharge = -1) {
  let ex = 0, ey = 0;
  for (const [cx, q] of [[-1, 1], [1, rightCharge]]) {
    const dx = x - cx, dy = y, r2 = dx * dx + dy * dy;
    if (r2 < 0.01) return null;
    const k = q / Math.pow(r2, 1.5); ex += k * dx; ey += k * dy;
  }
  return { x: ex, y: ey };
}
