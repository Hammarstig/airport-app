import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { geoCentroid, geoMercator, geoPath } from 'd3-geo';
import { loadCountryShapes } from './atlas.js';
import { ZoomableSvg } from './ZoomableSvg.jsx';

const W = 800;
const H = 600;

/** Landets form med flygplatser som prickar (besökta markerade). */
export function CountryMap({ code, airports }) {
  const navigate = useNavigate();
  const [features, setFeatures] = useState(null);
  const [tip, setTip] = useState(null);

  useEffect(() => {
    let live = true;
    loadCountryShapes(code).then((f) => live && setFeatures(f));
    return () => {
      live = false;
    };
  }, [code]);

  const geo = useMemo(() => {
    if (!features) return null;
    const pts = airports.filter((a) => a.lat != null && a.lon != null);
    const shape = { type: 'FeatureCollection', features };
    const fitTo = features.length ? shape : { type: 'MultiPoint', coordinates: pts.map((a) => [a.lon, a.lat]) };
    if (!features.length && !pts.length) return { paths: [], dots: [] };
    // Rotera kring landets mittpunkt så att länder över datumlinjen (USA, Ryssland, Fiji) hålls ihop.
    const [lon] = geoCentroid(fitTo);
    const proj = geoMercator()
      .rotate([-lon, 0])
      .fitExtent(
        [
          [16, 16],
          [W - 16, H - 16]
        ],
        fitTo
      );
    const path = geoPath(proj);
    const dots = pts
      .map((a) => {
        const xy = proj([a.lon, a.lat]);
        return xy ? { a, x: xy[0], y: xy[1] } : null;
      })
      .filter(Boolean)
      .sort((p, q) => Number(p.a.visited) - Number(q.a.visited));
    return { paths: features.map((f, i) => ({ key: i, d: path(f) })), dots };
  }, [features, airports]);

  const showTip = (e, a, touch = false) => {
    const box = e.currentTarget.ownerSVGElement.parentElement.getBoundingClientRect();
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, a, touch });
  };

  // Mus: klick öppnar flygplatsen. Touch: första tryck visar info, andra öppnar.
  const onDot = (e, a) => {
    const pt = e.nativeEvent.pointerType;
    if (pt === 'mouse' || (tip && tip.a === a)) navigate(`/airport/${a.iata}`);
    else showTip(e, a, true);
  };

  return (
    <div className="map">
      {!geo && <div style={{ aspectRatio: `${W} / ${H}` }} role="status" aria-label="Laddar karta" />}
      {geo && (
        <ZoomableSvg
          width={W}
          height={H}
          maxZoom={20}
          label="Karta över landets flygplatser"
          onBackgroundClick={() => setTip(null)}
        >
          {(k) => (
            <>
              {geo.paths.map((p) => (
                <path key={p.key} d={p.d} className="map__country" data-step="0" style={{ cursor: 'default' }} />
              ))}
              {geo.dots.map(({ a, x, y }) => (
                <circle
                  key={a.iata}
                  cx={x}
                  cy={y}
                  r={(a.visited ? 6 : 3.5) / Math.sqrt(k)}
                  className={`map__dot${a.visited ? ' map__dot--visited' : ''}`}
                  onPointerMove={(e) => e.pointerType === 'mouse' && showTip(e, a)}
                  onPointerLeave={() => setTip(null)}
                  onClick={(e) => onDot(e, a)}
                />
              ))}
            </>
          )}
        </ZoomableSvg>
      )}
      {tip && (
        <div className="map__tooltip" style={{ left: tip.x, top: tip.y }}>
          <strong>
            {tip.a.iata} {tip.a.name}
          </strong>
          {tip.a.city ? `${tip.a.city} · ` : ''}
          {tip.a.visited ? `Besökt ${tip.a.visits} ${tip.a.visits === 1 ? 'gång' : 'gånger'}` : 'Ej besökt'}
          {tip.touch && ' · tryck igen för att öppna'}
        </div>
      )}
      <div className="map__legend" aria-label="Teckenförklaring">
        <span className="map__legend-item">
          <span className="map__swatch map__swatch--dot-visited" /> Besökt
        </span>
        <span className="map__legend-item">
          <span className="map__swatch map__swatch--dot" /> Ej besökt
        </span>
      </div>
    </div>
  );
}
