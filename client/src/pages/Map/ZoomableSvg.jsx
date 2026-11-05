import { useEffect, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';

/**
 * SVG med pinch-/scroll-zoom och panorering (d3-zoom, fungerar med touch och mus).
 * children(k) får aktuell skalfaktor så att prickar kan hålla konstant storlek.
 */
export function ZoomableSvg({ width, height, maxZoom = 12, label, children, onBackgroundClick }) {
  const svgRef = useRef(null);
  const zoomRef = useRef(null);
  const [t, setT] = useState(zoomIdentity);

  useEffect(() => {
    const z = zoom()
      .scaleExtent([1, maxZoom])
      .translateExtent([
        [0, 0],
        [width, height]
      ])
      .on('zoom', (e) => setT(e.transform));
    zoomRef.current = z;
    const sel = select(svgRef.current).call(z);
    // Låt sidan skrolla vertikalt med ett finger tills användaren nyper eller har zoomat in.
    sel.style('touch-action', 'pan-y pinch-zoom');
    return () => sel.on('.zoom', null);
  }, [width, height, maxZoom]);

  useEffect(() => {
    if (svgRef.current) svgRef.current.style.touchAction = t.k > 1 ? 'none' : 'pan-y pinch-zoom';
  }, [t.k]);

  const zoomBy = (f) => select(svgRef.current).transition().duration(250).call(zoomRef.current.scaleBy, f);
  const reset = () => select(svgRef.current).transition().duration(250).call(zoomRef.current.transform, zoomIdentity);

  return (
    <>
      <svg
        ref={svgRef}
        className="map__svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
        onClick={(e) => e.target === svgRef.current && onBackgroundClick && onBackgroundClick()}
      >
        <g transform={t.toString()}>{children(t.k)}</g>
      </svg>
      <div className="row" style={{ position: 'absolute', top: 8, right: 8, gap: 4 }}>
        <button
          type="button"
          className="icon-btn"
          aria-label="Zooma in"
          onClick={() => zoomBy(1.6)}
          style={{ background: 'var(--surface)' }}
        >
          +
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Zooma ut"
          onClick={() => zoomBy(1 / 1.6)}
          style={{ background: 'var(--surface)' }}
        >
          −
        </button>
        {t.k > 1.01 && (
          <button type="button" className="btn btn--sm" onClick={reset} style={{ background: 'var(--surface)' }}>
            Återställ
          </button>
        )}
      </div>
    </>
  );
}
