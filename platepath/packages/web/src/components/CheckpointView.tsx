import { useMemo, useState } from 'react';
import { buildCheckpoints, identifyDetections, DRIVE_LABELS } from '@platepath/shared';
import type { Track, Vehicle } from '@platepath/shared';

/**
 * Checkpoint detection view: at each labeled checkpoint, box every vehicle but
 * read the plate ONLY for the registered vehicle. Mirrors the demo console and
 * uses the same shared `buildCheckpoints` + `identifyDetections` gate.
 */
export function CheckpointView({ track, vehicle }: { track: Track; vehicle: Vehicle }) {
  const checkpoints = useMemo(() => buildCheckpoints(track, DRIVE_LABELS), [track]);
  const [ci, setCi] = useState(0);
  const cp = checkpoints[ci] ?? checkpoints[0];
  if (!cp) return null;

  return (
    <>
      <div className="cpchips">
        {checkpoints.map((c, i) => (
          <button key={i} className={`cpchip ${i === ci ? 'active' : ''}`} onClick={() => setCi(i)}>
            <b>{c.label}</b>
            <span>t+{c.timeCode} · {Math.round(c.speedMph)} mph</span>
          </button>
        ))}
      </div>
      <DetectionFrame cp={cp} vehicle={vehicle} index={ci} />
      <Caption cp={cp} vehicle={vehicle} />
    </>
  );
}

function Caption({ cp, vehicle }: { cp: ReturnType<typeof buildCheckpoints>[number]; vehicle: Vehicle }) {
  return (
    <div className="cpcaption">
      <b>1 vehicle <span className="id">identified</span></b> — your registered plate{' '}
      <b className="mono">{vehicle.plate} · {vehicle.state}</b> at <b>{Math.round(cp.speedMph)} mph</b>
      {cp.speedLimitMph ? ` (limit ${cp.speedLimitMph})` : ''}. <b>3 others <span className="anon">detected, not
      identified</span></b>. PlatePath boxes every vehicle a checkpoint sees but reads plates only for vehicles
      you've verified — everyone else stays anonymous. That gate is what separates this from illegal mass
      plate-scraping.
    </div>
  );
}

function DetectionFrame({
  cp,
  vehicle,
  index,
}: {
  cp: ReturnType<typeof buildCheckpoints>[number];
  vehicle: Vehicle;
  index: number;
}) {
  const CW = 760, CH = 380, vpx = CW * 0.52;
  const road = (t: number) => ({
    y: CH * 0.99 + (CH * 0.34 - CH * 0.99) * t,
    half: CW * 0.46 * (1 - t) + CW * 0.05 * t,
    cx: CW * 0.5 * (1 - t) + vpx * t,
    scale: (1 - t) * 1.0 + t * 0.34,
  });
  const laneX = (lane: number, t: number) => road(t).cx + (lane - 1) * road(t).half * 0.5;

  // Deterministic decoy speeds; the registered vehicle is the target.
  const detected = [
    { plate: vehicle.plate, speedMph: Math.round(cp.speedMph) },
    { plate: 'XZ4471', speedMph: (cp.speedLimitMph ?? 45) + ((index * 7) % 11) - 4 },
    { plate: 'QW8823', speedMph: (cp.speedLimitMph ?? 45) + ((index * 5) % 9) - 2 },
    { plate: 'LP2290', speedMph: (cp.speedLimitMph ?? 45) - ((index * 3) % 6) },
  ];
  const results = identifyDetections(detected, [vehicle.plate]);
  const scene = [
    { lane: 1, t: 0.36, r: results[0], speed: detected[0].speedMph },
    { lane: 0, t: 0.6, r: results[1], speed: detected[1].speedMph },
    { lane: 2, t: 0.5, r: results[2], speed: detected[2].speedMph },
    { lane: 0, t: 0.18, r: results[3], speed: detected[3].speedMph },
  ].sort((a, b) => b.t - a.t);

  return (
    <svg className="cpframe" viewBox={`0 0 ${CW} ${CH}`} role="img" aria-label="Checkpoint detection frame">
      <rect x={0} y={0} width={CW} height={CH} fill="#05080f" />
      <rect x={0} y={0} width={CW} height={CH * 0.34} fill="#0a1322" />
      <Road road={road} CW={CW} />
      {scene.map((v, i) => (
        <Car key={i} v={v} road={road} laneX={laneX} plate={vehicle.plate} state={vehicle.state} />
      ))}
      <text x={16} y={26} fill="#e6edf7" fontFamily="ui-monospace, monospace" fontSize={13} fontWeight={600}>{cp.label}</text>
      <text x={16} y={44} fill="#8ea3bd" fontFamily="ui-monospace, monospace" fontSize={12}>t+{cp.timeCode}{cp.speedLimitMph ? ` · limit ${cp.speedLimitMph}` : ''}</text>
      <rect x={CW - 176} y={14} width={120} height={22} rx={5} fill="#0f1626" stroke="#26355a" />
      <text x={CW - 166} y={29} fill="#22d3ee" fontFamily="ui-monospace, monospace" fontSize={11} fontWeight={600}>ALPR · CHECKPOINT</text>
    </svg>
  );
}

function Road({ road, CW }: { road: (t: number) => { y: number; half: number; cx: number }; CW: number }) {
  const bl = road(0), tf = road(1);
  const dashes = [];
  for (const div of [0.5, 1.5]) {
    for (let t = 0.04; t < 0.98; t += 0.13) {
      const r1 = road(t), r2 = road(t + 0.055);
      dashes.push(
        <line key={`${div}-${t}`} x1={r1.cx + (div - 1) * r1.half * 0.5} y1={r1.y} x2={r2.cx + (div - 1) * r2.half * 0.5} y2={r2.y} stroke="#41506a" strokeWidth={2} />,
      );
    }
  }
  return (
    <>
      <polygon points={`${bl.cx - bl.half},${bl.y} ${bl.cx + bl.half},${bl.y} ${tf.cx + tf.half},${tf.y} ${tf.cx - tf.half},${tf.y}`} fill="#111722" />
      {dashes}
    </>
  );
}

function Car({
  v,
  road,
  laneX,
  plate,
}: {
  v: { lane: number; t: number; r: { identified: boolean }; speed: number };
  road: (t: number) => { y: number; scale: number };
  laneX: (lane: number, t: number) => number;
  plate: string;
  state: string;
}) {
  const r = road(v.t), x = laneX(v.lane, v.t), cw = 98 * r.scale, ch = 70 * r.scale, top = r.y - ch, left = x - cw / 2;
  const target = v.r.identified;
  const pad = target ? 7 : 4;
  return (
    <g>
      <rect x={left} y={top} width={cw} height={ch} rx={8 * r.scale} fill={target ? '#33415c' : '#2a3140'} stroke="#161c26" strokeWidth={1.5} />
      <rect x={left + cw * 0.16} y={top + ch * 0.12} width={cw * 0.68} height={ch * 0.32} rx={4 * r.scale} fill="#0c111a" />
      <text x={left} y={top - 8} fill="#fff" fontFamily="ui-monospace, monospace" fontSize={Math.max(12, Math.round(20 * r.scale))} fontWeight={600}>{Math.round(v.speed)}</text>
      <rect x={left - pad} y={top - pad} width={cw + pad * 2} height={ch + pad * 2} fill="none" stroke={target ? '#ef4444' : '#94a3b8'} strokeWidth={target ? 3 : 1.5} opacity={target ? 1 : 0.55} />
      {target ? (
        <>
          <rect x={left - pad} y={top - pad - 24} width={74} height={20} rx={4} fill="#ef4444" />
          <text x={left - pad + 8} y={top - pad - 10} fill="#fff" fontFamily="ui-monospace, monospace" fontSize={11} fontWeight={700}>● MATCH</text>
          <rect x={x - Math.max(70, cw * 0.62) / 2} y={r.y - Math.max(20, ch * 0.3) - ch * 0.06} width={Math.max(70, cw * 0.62)} height={Math.max(20, ch * 0.3)} rx={3} fill="#0b0f16" stroke="#ef4444" strokeWidth={2} />
          <text x={x} y={r.y - Math.max(20, ch * 0.3) * 0.34 - ch * 0.06} textAnchor="middle" fill="#fff" fontFamily="ui-monospace, monospace" fontWeight={700} fontSize={Math.max(11, Math.round(Math.max(20, ch * 0.3) * 0.6))}>{plate}</text>
        </>
      ) : (
        <text x={x} y={r.y - ch * 0.2} textAnchor="middle" fill="#64748b" fontFamily="ui-monospace, monospace" fontSize={Math.max(9, Math.round(13 * r.scale))}>▓▓▓▓</text>
      )}
    </g>
  );
}
