// Platshållare under laddning. Använder befintliga yttokens så inget hoppar när innehållet kommer.
const bar = (w, h = 12) => ({
  display: 'block',
  width: w,
  height: h,
  borderRadius: 6,
  background: 'var(--surface-2)'
});

export function SkeletonCard() {
  return (
    <div className="card skeleton" aria-hidden="true">
      <div className="card__body stack">
        <div className="row items-center">
          <span style={{ ...bar(40, 40), borderRadius: '50%' }} />
          <span className="stack" style={{ flex: 1, gap: 6 }}>
            <span style={bar('55%')} />
            <span style={bar('35%', 10)} />
          </span>
        </div>
        <span style={bar('80%')} />
        <span style={bar('60%')} />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3, label = 'Laddar' }) {
  return (
    <div className="stack" role="status" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonRows({ count = 6, label = 'Laddar' }) {
  return (
    <div className="list" role="status" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="list__item skeleton" aria-hidden="true">
          <span style={bar(48, 28)} />
          <span className="stack" style={{ flex: 1, gap: 6 }}>
            <span style={bar('60%')} />
            <span style={bar('40%', 10)} />
          </span>
          <span style={bar(40, 28)} />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="page">
      <div className="page__header" aria-hidden="true">
        <span style={bar('45%', 28)} />
      </div>
      <SkeletonList count={3} />
    </div>
  );
}
