import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { usePaged } from '../../hooks/usePaged.js';
import { setUnread } from '../../hooks/useUnread.js';
import { timeAgo } from '../../lib/format.js';
import { Avatar, EmptyState, ErrorState } from '../../components/ui.jsx';
import { SkeletonRows } from '../../components/Skeleton.jsx';
import {
  IconBadge,
  IconBell,
  IconCheck,
  IconComment,
  IconHeart,
  IconHome,
  IconTrophy,
  IconUsers
} from '../../assets/icons.jsx';
import { FollowRequests } from '../../components/FollowRequests.jsx';
import { badgeUrl } from '../../components/Badges.jsx';

const TYPE_ICON = {
  follow: IconUsers,
  follow_request: IconUsers,
  follow_accepted: IconUsers,
  comment: IconComment,
  like: IconHeart,
  badge: IconBadge,
  home_visit: IconHome,
  overtaken: IconTrophy,
  invite_accepted: IconUsers,
  mayor_gained: IconTrophy,
  mayor_lost: IconTrophy,
  challenge_completed: IconCheck
};

function target(n) {
  if (n.url) return n.url;
  if (n.checkinId) return `/c/${n.checkinId}`;
  if (n.type === 'follow' && n.actor) return `/u/${n.actor.username}`;
  if (n.type === 'badge') return null;
  if (n.airport) return `/airport/${n.airport.iata}`;
  return null;
}

function Media({ n }) {
  const Icon = TYPE_ICON[n.type] || IconBell;
  const badge = n.badges?.[0] || n.badge;
  return (
    <span className="notif-item__media" aria-hidden="true">
      {n.actor ? (
        <Avatar user={n.actor} />
      ) : badge && badgeUrl(badge) ? (
        <img src={badgeUrl(badge)} alt="" width={44} height={44} />
      ) : (
        <Icon size={24} />
      )}
      <span className={`notif-item__type notif-item__type--${n.type}`}>
        <Icon size={12} />
      </span>
    </span>
  );
}

function Item({ n, me }) {
  const to = target(n) || (n.type === 'badge' || n.type === 'challenge_completed' ? `/u/${me}?tab=badges` : null);
  const many = n.badges && n.badges.length > 1;
  const body = (
    <>
      <Media n={n} />
      <span className="notif-item__text">
        {!n.read && <span className="visually-hidden">Oläst: </span>}
        {n.text}
        {many && (
          <span className="notif-badges" aria-label={n.badges.map((b) => b.name).join(', ')}>
            {n.badges
              .slice(0, 5)
              .map((b) =>
                badgeUrl(b) ? <img key={`${b.id}-${b.tier}`} src={badgeUrl(b)} alt="" width={24} height={24} /> : null
              )}
          </span>
        )}
      </span>
      <time className="notif-item__time" dateTime={n.createdAt}>
        {timeAgo(n.createdAt)}
      </time>
    </>
  );
  return (
    <li className={`list__item notif-item${n.read ? '' : ' notif-item--unread'}`}>
      {to ? (
        <Link to={to} className="row row--nowrap items-center gap-2 flex-1 min-w-0">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}

export default function NotificationsPage() {
  useDocumentTitle('Notiser');
  const paged = usePaged(async (limit, offset) => (await api.notifications(limit, offset)).items, [], 30);
  const me = useAuth().user.username;

  // Markera allt som läst när listan har visats (punkterna syns kvar under besöket).
  const hasUnread = paged.items.some((n) => !n.read);
  useEffect(() => {
    if (!hasUnread) return;
    api
      .markRead()
      .then((r) => setUnread(r.unread))
      .catch((e) => console.warn('Kunde inte markera notiser som lästa:', e.message));
  }, [hasUnread]);

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">Notiser</h1>
      </header>
      <FollowRequests />
      {paged.error && !paged.items.length && <ErrorState error={paged.error} onRetry={paged.reload} />}
      {paged.loading && !paged.items.length && <SkeletonRows count={5} />}
      {!paged.loading && !paged.error && !paged.items.length && (
        <EmptyState icon={IconBell} title="Inga notiser ännu">
          <p className="muted">Här ser du när någon följer dig, gillar eller kommenterar dina check-ins.</p>
        </EmptyState>
      )}
      {paged.items.length > 0 && (
        <ul className="list">
          {paged.items.map((n) => (
            <Item key={n.id} n={n} me={me} />
          ))}
        </ul>
      )}
      {!paged.loading && paged.hasMore && (
        <button type="button" className="btn btn--ghost btn--block" onClick={paged.loadMore}>
          Ladda fler
        </button>
      )}
    </div>
  );
}
