export function prefersReducedMotion(
  win: Pick<Window, 'matchMedia'> | undefined = typeof window === 'undefined'
    ? undefined
    : window,
): boolean {
  return win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

export function scrollBehavior(
  win?: Pick<Window, 'matchMedia'>,
): ScrollBehavior {
  return prefersReducedMotion(win) ? 'auto' : 'smooth'
}
