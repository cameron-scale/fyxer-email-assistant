import type { LatLng } from './geo.ts';

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface Viewport {
  width: number;
  height: number;
  project: (p: LatLng) => ProjectedPoint;
}

/**
 * Build an equirectangular projection that fits a set of coordinates into a
 * width×height box with padding, correcting for latitude so the aspect ratio
 * looks right at US latitudes. Used to draw the route as an SVG polyline in both
 * the web app and the offline demo (no map tiles / API key required).
 *
 * A production build overlays the same segment geometry on Google Maps
 * (Polyline with per-segment color) using the JS Maps SDK; this projection is
 * the tile-free fallback and the demo renderer.
 */
export function makeViewport(
  points: LatLng[],
  width: number,
  height: number,
  padding = 24,
): Viewport {
  if (points.length === 0) {
    return { width, height, project: () => ({ x: width / 2, y: height / 2 }) };
  }

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const midLat = (minLat + maxLat) / 2;
  const cos = Math.cos((midLat * Math.PI) / 180) || 1;

  // Longitude degrees are "narrower" than latitude by cos(lat); scale x by cos.
  const spanLng = Math.max(1e-6, (maxLng - minLng) * cos);
  const spanLat = Math.max(1e-6, maxLat - minLat);

  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const scale = Math.min(innerW / spanLng, innerH / spanLat);

  // Center the drawing within the box.
  const drawW = spanLng * scale;
  const drawH = spanLat * scale;
  const offsetX = padding + (innerW - drawW) / 2;
  const offsetY = padding + (innerH - drawH) / 2;

  return {
    width,
    height,
    project: (p: LatLng) => ({
      x: offsetX + (p.lng - minLng) * cos * scale,
      // SVG y grows downward, so invert latitude.
      y: offsetY + (maxLat - p.lat) * scale,
    }),
  };
}
