import { CheckinCard } from './CheckinCard.jsx';
import { SkeletonList } from './Skeleton.jsx';

export function CheckinList({ paged, empty, onDeleteItem, ...cardProps }) {
  const { items, loading, error, hasMore, loadMore, reload, setItems } = paged;
  if (error && items.length === 0) {
    return (
      <div className="empty-state" role="alert">
        <p className="mt-0 mb-0">{error.message}</p>
        <button type="button" className="btn btn--sm" onClick={reload}>
          Försök igen
        </button>
      </div>
    );
  }
  return (
    <div className="stack">
      {items.map((c) => (
        <CheckinCard
          key={c.id}
          checkin={c}
          onDelete={(id) => {
            setItems((xs) => xs.filter((x) => x.id !== id));
            onDeleteItem && onDeleteItem(id);
          }}
          {...cardProps}
        />
      ))}
      {!loading && items.length === 0 && empty}
      {loading && <SkeletonList count={items.length ? 1 : 3} label="Laddar check-ins" />}
      {!loading && hasMore && (
        <button type="button" className="btn btn--ghost btn--block" onClick={loadMore}>
          Ladda fler
        </button>
      )}
    </div>
  );
}
