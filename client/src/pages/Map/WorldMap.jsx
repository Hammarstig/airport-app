import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { loadWorld, coverageStep, STEP_LABELS } from './atlas.js';
import { ZoomableSvg } from './ZoomableSvg.jsx';

const W = 960;
const H = 500;

export function WorldMap({ username, countries }) {
  const navigate = useNavigate();
  const [features, setFeatures] = useState(null);
  const [tip, setTip] = useState(null);

  useEffect(() => {
    let live = true;
    loadWorld().then((f) => live && setFeatures(f.filter((x) => x.alpha2 !== 'AQ')));
    return () => {
      live = false;
    };
  }, []);

  const byCode = useMemo(() => Object.fromEntries((countries || []).map((c) => [c.code, c])), [countries]);

  const paths = useMemo(() => {
    if (!features) return [];
    const proj = geoNaturalEarth1().fitSize([W, H], { type: 'FeatureCollection', features });
    const path = geoPath(proj);
    return features.map((f, i) => ({
      key: `${f.id ?? 'x'}-${i}`,
      d: path(f),
      code: f.alpha2,
      name: f.properties.name
    }));
  }, [features]);

  const showTip = (e, p) => {
    const box = e.currentTarget.ownerSVGElement.parentElement.getBoundingClientRect();
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, p });
  };

  return (
    <div className="map" style={{ minHeight: 160 }}>
      {!features && <div style={{ aspectRatio: `${W} / ${H}` }} role="status" aria-label="Laddar karta" />}
      {features && (
        <ZoomableSvg
          width={W}
          height={H}
          maxZoom={10}
          label="Världskarta med besökta länder"
          onBackgroundClick={() => setTip(null)}
        >
          {() =>
            paths.map((p) => {
              const c = p.code && byCode[p.code];
              const step = c ? coverageStep(c.visited, c.pct) : 0;
              return (
                <path
                  key={p.key}
                  d={p.d}
                  className="map__country"
                  data-step={step}
                  onPointerMove={(e) => e.pointerType === 'mouse' && showTip(e, p)}
                  onPointerLeave={() => setTip(null)}
                  onClick={() => c && navigate(`/u/${username}/map/${p.code}${window.location.search}`)}
                />
              );
            })
          }
        </ZoomableSvg>
      )}
      {tip && (
        <div className="map__tooltip" style={{ left: tip.x, top: tip.y }}>
          <strong>{byCode[tip.p.code]?.name || tip.p.name}</strong>
          {byCode[tip.p.code]
            ? `${byCode[tip.p.code].visited} av ${byCode[tip.p.code].total} flygplatser (${byCode[tip.p.code].pct} %)`
            : 'Inga flygplatser'}
        </div>
      )}
      <div className="map__legend" aria-label="Teckenförklaring">
        <span className="map__legend-item">
          <span className="map__swatch" /> Ej besökt
        </span>
        <span className="map__legend-item">
          <span className="map__legend-scale" title={STEP_LABELS.join(', ')}>
            {STEP_LABELS.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </span>
          Andel besökta flygplatser (låg till hög)
        </span>
      </div>
    </div>
  );
}
