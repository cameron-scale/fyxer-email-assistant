import { makeViewport, speedBand, timeCode } from '@platepath/shared';
import type { Track, Segment } from '@platepath/shared';

const BAND_COLOR: Record<ReturnType<typeof speedBand>, string> = {
  gap: 'transparent',
  stopped: '#64748b',
  ok: '#16a34a',
  warn: '#f59e0b',
  over: '#dc2626',
};

/**
 * Tile-free route renderer: draws the traced path as speed-colored segments in
 * an SVG. In production this same geometry is drawn as a Google Maps Polyline;
 * this keeps the app functional with no Maps API key.
 */
export function RouteMap({
  track,
  labels = [],
  selected,
  onSelect,
  width = 720,
  height = 460,
}: {
  track: Track;
  labels?: { lat: number; lng: number; label: string }[];
  selected?: number;
  onSelect?: (index: number) => void;
  width?: number;
  height?: number;
}) {
  const vp = makeViewport(track.pings, width, height);

  return (
    <svg
      className="routemap"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Vehicle route colored by speed"
    >
      <rect x={0} y={0} width={width} height={height} rx={12} fill="#0b1220" />
      {/* faint grid */}
      {Array.from({ length: 9 }).map((_, i) => (
        <line key={`v${i}`} x1={(width / 8) * i} y1={0} x2={(width / 8) * i} y2={height} stroke="#1e293b" strokeWidth={1} />
      ))}
      {Array.from({ length: 6 }).map((_, i) => (
        <line key={`h${i}`} x1={0} y1={(height / 5) * i} x2={width} y2={(height / 5) * i} stroke="#1e293b" strokeWidth={1} />
      ))}

      {track.segments.map((seg: Segment) => {
        if (seg.isGap) return null;
        const a = vp.project(seg.from);
        const b = vp.project(seg.to);
        const band = speedBand(seg);
        const isSel = selected === seg.index;
        return (
          <line
            key={seg.index}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={BAND_COLOR[band]}
            strokeWidth={isSel ? 8 : 5}
            strokeLinecap="round"
            opacity={selected == null || isSel ? 1 : 0.55}
            onClick={() => onSelect?.(seg.index)}
            style={{ cursor: onSelect ? 'pointer' : 'default' }}
          />
        );
      })}

      {/* start / end markers */}
      {track.pings.length > 0 && (
        <>
          <Marker p={vp.project(track.pings[0])} color="#22d3ee" label="Start" />
          <Marker p={vp.project(track.pings[track.pings.length - 1])} color="#a78bfa" label="End" />
        </>
      )}

      {labels.map((l, i) => {
        const p = vp.project(l);
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3} fill="#e2e8f0" />
            <text x={p.x + 6} y={p.y - 6} fill="#94a3b8" fontSize={11}>
              {l.label}
            </text>
          </g>
        );
      })}

      {/* selected segment time code + speed */}
      {selected != null && track.segments[selected] && (
        <text x={12} y={height - 14} fill="#e2e8f0" fontSize={13}>
          {`t+${timeCode(track, track.segments[selected].to)} · ${track.segments[selected].speedMph} mph` +
            (track.segments[selected].speedLimitMph
              ? ` (limit ${track.segments[selected].speedLimitMph})`
              : '')}
        </text>
      )}
    </svg>
  );
}

function Marker({ p, color, label }: { p: { x: number; y: number }; color: string; label: string }) {
  return (
    <g>
      <circle cx={p.x} cy={p.y} r={7} fill={color} stroke="#0b1220" strokeWidth={2} />
      <text x={p.x + 10} y={p.y + 4} fill="#e2e8f0" fontSize={12} fontWeight={600}>
        {label}
      </text>
    </g>
  );
}
