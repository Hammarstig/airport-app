import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { usePaged } from '../../hooks/usePaged.js';
import { CheckinList } from '../../components/CheckinList.jsx';
import { PageSkeleton } from '../../components/Skeleton.jsx';
import { EmptyState, ErrorState, Tabs } from '../../components/ui.jsx';
import { IconPlane } from '../../assets/icons.jsx';
import NotFoundPage from '../NotFound/NotFoundPage.jsx';
import { ProfileHeader } from './ProfileHeader.jsx';
import { AirportsTab } from './AirportsTab.jsx';
import { BadgesTab, WishlistTab } from './OtherTabs.jsx';
import { MapTab } from './MapTab.jsx';

const TAB_KEYS = ['airports', 'checkins', 'badges', 'map', 'wishlist'];

export default function ProfilePage() {
  const { username } = useParams();
  const { user } = useAuth();
  const isMe = !!user && user.username === username;
  const {
    data: profile,
    error,
    loading,
    reload,
    setData
  } = useAsync(
    () => api.user(username),
    [username],
    () => api.peek.user(username)
  );
  const [params, setParams] = useSearchParams();
  const tab = TAB_KEYS.includes(params.get('tab')) ? params.get('tab') : 'airports';
  const setTab = (t) => setParams(t === 'airports' ? {} : { tab: t }, { replace: true });
  const paged = usePaged(
    (limit, offset) => api.userCheckins(username, limit, offset),
    [username],
    20,
    (limit) => api.peek.userCheckins(username, limit, 0)
  );
  useDocumentTitle(profile ? profile.displayName || profile.username : username);

  if (error?.status === 404) return <NotFoundPage message={`Användaren ${username} finns inte.`} />;
  if (loading && !profile) return <PageSkeleton />;
  if (error)
    return (
      <div className="page">
        <ErrorState error={error} onRetry={reload} />
      </div>
    );

  return (
    <div className="page">
      <ProfileHeader
        profile={profile}
        isMe={isMe}
        onFollowChange={(r) => setData((p) => ({ ...p, followers: r.followers, followedByMe: r.following }))}
      />
      <div className="mt-4">
        <Tabs
          label="Profilflikar"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'airports', label: isMe ? 'Mina flygplatser' : 'Flygplatser' },
            { value: 'checkins', label: 'Check-ins' },
            { value: 'badges', label: 'Märken' },
            { value: 'map', label: 'Karta' },
            { value: 'wishlist', label: 'Önskelista' }
          ]}
        />
      </div>
      <div role="tabpanel" aria-labelledby={`tab-${tab}`} className="tabpanel">
        {tab === 'airports' && <AirportsTab username={username} isMe={isMe} />}
        {tab === 'checkins' && (
          <CheckinList
            paged={paged}
            hideUser
            onDeleteItem={isMe ? () => reload() : undefined}
            empty={<EmptyState icon={IconPlane} title="Inga check-ins ännu" />}
          />
        )}
        {tab === 'badges' && <BadgesTab username={username} />}
        {tab === 'map' && <MapTab username={username} />}
        {tab === 'wishlist' && <WishlistTab username={username} isMe={isMe} />}
      </div>
    </div>
  );
}
