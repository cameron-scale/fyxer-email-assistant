import { useEffect, useState } from 'react';
import type { Owner, Track } from '@platepath/shared';
import { speedBand, timeCode } from '@platepath/shared';
import { api, type VehicleWithGate } from './api.ts';
import { RouteMap } from './components/RouteMap.tsx';
import { CheckpointView } from './components/CheckpointView.tsx';

export function App() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [ownerId, setOwnerId] = useState<string>('');
  const [vehicles, setVehicles] = useState<VehicleWithGate[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string>('');
  const [track, setTrack] = useState<Track | null>(null);
  const [blocked, setBlocked] = useState<string>('');
  const [selectedSeg, setSelectedSeg] = useState<number | undefined>();
  const [view, setView] = useState<'route' | 'checkpoints'>('route');

  useEffect(() => {
    api.owners().then((o) => {
      setOwners(o);
      setOwnerId(o[0]?.id ?? '');
    });
  }, []);

  useEffect(() => {
    if (!ownerId) return;
    setTrack(null);
    setSelectedVehicle('');
    api.vehicles(ownerId).then(setVehicles);
  }, [ownerId]);

  async function openVehicle(id: string) {
    setSelectedVehicle(id);
    setBlocked('');
    setTrack(null);
    setSelectedSeg(undefined);
    try {
      const { track } = await api.track(id, ownerId);
      setTrack(track);
    } catch (e) {
      setBlocked((e as { body?: { message?: string } }).body?.message ?? 'Access blocked.');
    }
  }

  const owner = owners.find((o) => o.id === ownerId);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="dot" /> PlatePath
          <span className="tag">consent-based route intelligence</span>
        </div>
        <label className="owner-switch">
          Viewing as&nbsp;
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.displayName} ({o.role})
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <h2>Registered vehicles</h2>
          <p className="hint">
            Only vehicles you have <strong>verified ownership of</strong> can be
            tracked. Typing a plate is never enough.
          </p>
          {vehicles.map((v) => (
            <button
              key={v.id}
              className={`veh ${selectedVehicle === v.id ? 'active' : ''}`}
              onClick={() => openVehicle(v.id)}
            >
              <div className="veh-top">
                <span className="plate">
                  {v.plate} · {v.state}
                </span>
                <span className={`badge ${v.trackable ? 'ok' : 'locked'}`}>
                  {v.trackable ? 'Verified' : v.verificationStatus}
                </span>
              </div>
              <div className="veh-sub">
                {v.nickname ?? `${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''}`}
              </div>
              {!v.trackable && <div className="veh-lock">🔒 Locked — {v.reason}</div>}
            </button>
          ))}
        </aside>

        <main className="content">
          {!selectedVehicle && (
            <div className="empty">
              <h1>Trace a vehicle you own</h1>
              <p>
                Pick a vehicle. You'll see its route with time codes and its speed
                in each section — but only after ownership is verified. This
                account is a <strong>{owner?.role}</strong> account.
              </p>
            </div>
          )}

          {blocked && (
            <div className="blocked">
              <h1>🔒 Location history is locked</h1>
              <p>{blocked}</p>
              <p className="hint">
                This is the anti-stalking gate working as designed: no verified
                ownership → no location data, ever.
              </p>
            </div>
          )}

          {track && (
            <>
              <section className="totals">
                <Stat label="Distance" value={`${track.totals.distanceMi} mi`} />
                <Stat label="Avg speed" value={`${track.totals.avgSpeedMph} mph`} />
                <Stat label="Top speed" value={`${track.totals.maxSpeedMph} mph`} warn={track.totals.maxSpeedMph > 80} />
                <Stat label="Speeding legs" value={String(track.totals.speedingSegments)} warn={track.totals.speedingSegments > 0} />
                <Stat label="Stops" value={String(track.totals.stops)} />
              </section>

              <div className="viewtabs">
                <button className={`viewtab ${view === 'route' ? 'active' : ''}`} onClick={() => setView('route')}>🗺 Route map</button>
                <button className={`viewtab ${view === 'checkpoints' ? 'active' : ''}`} onClick={() => setView('checkpoints')}>🎯 Checkpoint detection</button>
              </div>

              {view === 'checkpoints' ? (
                <CheckpointView track={track} vehicle={vehicles.find((v) => v.id === selectedVehicle)!} />
              ) : (
                <>
              <RouteMap
                track={track}
                selected={selectedSeg}
                onSelect={setSelectedSeg}
              />

              <div className="legend">
                <span><i style={{ background: '#16a34a' }} /> at/under limit</span>
                <span><i style={{ background: '#f59e0b' }} /> 6–12 over</span>
                <span><i style={{ background: '#dc2626' }} /> 12+ over</span>
                <span><i style={{ background: '#64748b' }} /> stopped</span>
              </div>

              <h2>Segments (time code · speed · limit)</h2>
              <div className="segtable">
                <div className="segrow head">
                  <span>t+</span><span>Section</span><span>Speed</span><span>Limit</span><span>Dist</span><span></span>
                </div>
                {track.segments
                  .filter((s) => !s.isGap)
                  .map((s) => (
                    <div
                      key={s.index}
                      className={`segrow ${selectedSeg === s.index ? 'sel' : ''}`}
                      onClick={() => setSelectedSeg(s.index)}
                    >
                      <span>{timeCode(track, s.to)}</span>
                      <span>#{s.index + 1}</span>
                      <span className={s.isSpeeding ? 'over' : ''}>{s.speedMph} mph</span>
                      <span>{s.speedLimitMph ?? '—'}</span>
                      <span>{s.distanceMi.toFixed(2)} mi</span>
                      <span className={`pill ${speedBand(s)}`}>{speedBand(s)}</span>
                    </div>
                  ))}
              </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`stat ${warn ? 'warn' : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
