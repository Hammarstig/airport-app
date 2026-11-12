import { useEffect, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';

/**
 * SVG med pinch-/scroll-zoom och panorering (d3-zoom, fungerar med touch och mus).
 * children(k) får aktuell skalfaktor så att prickar kan hålla konstant storlek.
 */
/** Transform som visar rutan [[x0, y0], [x1, y1]] (viewBox-koordinater) med marginal. */
export function fitTransform(box, width, height, maxZoom) {
  const [[x0, y0], [x1, y1]] = box;
  const k = Math.max(1, Math.min(maxZoom, 0.8 / Math.max((x1 - x0) / width, (y1 - y0) / height)));
  const tx = width / 2 - (k * (x0 + x1)) / 2;
  const ty = height / 2 - (k * (y0 + y1)) / 2;
  return zoomIdentity.translate(tx, ty).scale(k);
}

export function ZoomableSvg({ width, height, maxZoom = 12, label, children, onBackgroundClick, focus }) {
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
    // Börja inzoomad på det intressanta området (t.ex. besökta länder).
    if (focus) sel.call(z.transform, fitTransform(focus, width, height, maxZoom));
    // Låt sidan skrolla vertikalt med ett finger tills användaren nyper eller har zoomat in.
    sel.style('touch-action', 'pan-y pinch-zoom');
    return () => sel.on('.zoom', null);
  }, [width, height, maxZoom]); // eslint-disable-line react-hooks/exhaustive-deps -- focus gäller bara startläget

  useEffect(() => {
    if (svgRef.current) svgRef.current.style.touchAction = t.k > 1 ? 'none' : 'pan-y pinch-zoom';
  }, [t.k]);

  const zoomBy = (f) => select(svgRef.current).transition().duration(250).call(zoomRef.current.scaleBy, f);
  const to = (tr) => select(svgRef.current).transition().duration(300).call(zoomRef.current.transform, tr);
  const world = t.k > 1.01;

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
        {world ? (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => to(zoomIdentity)}
            style={{ background: 'var(--surface)' }}
          >
            Hela världen
          </button>
        ) : (
          focus && (
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => to(fitTransform(focus, width, height, maxZoom))}
              style={{ background: 'var(--surface)' }}
            >
              Mina länder
            </button>
          )
        )}
      </div>
    </>
  );
}
