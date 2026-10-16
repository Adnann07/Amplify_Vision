import { useEffect, useState } from 'react'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function getReducedMotionPreference() {
  return import.meta.env.PROD &&
    typeof window !== 'undefined' &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
}

export function useAppReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(getReducedMotionPreference)

  useEffect(() => {
    if (!import.meta.env.PROD) return

    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY)
    const updatePreference = (event: MediaQueryListEvent) => setReducedMotion(event.matches)
    mediaQuery.addEventListener('change', updatePreference)

    return () => mediaQuery.removeEventListener('change', updatePreference)
  }, [])

  return reducedMotion
}
