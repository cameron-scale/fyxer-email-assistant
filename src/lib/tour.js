// tour.js — a tiny registry so the onboarding overlay can spotlight real UI
// elements. Screens register a View ref by id; the tour measures it at runtime
// (measureInWindow → window coordinates, which match the full-screen SVG overlay).
// No hardcoded pixel positions — every spotlight is resolved fresh.

import { useRef, useEffect } from 'react';

const targets = new Map();

export function registerTarget(id, ref) {
  if (ref) targets.set(id, ref);
  else targets.delete(id);
}

export function measureTarget(id) {
  return new Promise((resolve) => {
    const ref = targets.get(id);
    const node = ref && ref.current;
    if (!node || typeof node.measureInWindow !== 'function') return resolve(null);
    node.measureInWindow((x, y, width, height) => {
      if (width == null || (width === 0 && height === 0)) return resolve(null);
      resolve({ x, y, width, height });
    });
  });
}

// Attach the returned ref (+ collapsable={false}) to the View you want spotlighted.
export function useTourTarget(id) {
  const ref = useRef(null);
  useEffect(() => {
    registerTarget(id, ref);
    return () => registerTarget(id, null);
  }, [id]);
  return ref;
}
