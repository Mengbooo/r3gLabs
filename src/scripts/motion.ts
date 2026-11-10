import { gsap } from 'gsap';
export const reducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)',
).matches;
export function tween(
  target: gsap.TweenTarget,
  options: gsap.TweenVars,
): gsap.core.Tween {
  return gsap.to(target, {
    ...options,
    duration: reducedMotion ? 0 : options.duration,
    delay: reducedMotion ? 0 : options.delay || 0,
  });
}
export const kill = (target: gsap.TweenTarget): void => {
  gsap.killTweensOf(target);
};
