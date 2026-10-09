/** True when the visitor asked for less motion. Guarded, since a test or an old browser may have no matchMedia. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));
export const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
