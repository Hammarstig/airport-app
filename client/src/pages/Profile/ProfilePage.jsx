import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { usePaged } from '../../hooks/usePaged.js';
import { formatRating } from '../../lib/format.js';
import { CheckinList } from '../../components/CheckinList.jsx';
import { PageSkeleton } from '../../components/Skeleton.jsx';
import { Avatar, EmptyState, ErrorState, Stat, Tabs } from '../../components/ui.jsx';
import { IconPlane } from '../../assets/icons.jsx';
import NotFoundPage from '../NotFound/NotFoundPage.jsx';
import { EditProfile } from './EditProfile.jsx';
import { AirportsTab } from './AirportsTab.jsx';
import { BadgesTab, WishlistTab } from './OtherTabs.jsx';

const TAB_KEYS = ['airports', 'checkins', 'badges', 'wishlist'];

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
  const navigate = useNavigate();
  const setTab = (t) =>
    t === 'map' ? navigate(`/u/${username}/map`) : setParams(t === 'airports' ? {} : { tab: t }, { replace: true });
  const [editing, setEditing] = useState(false);
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

  const st = profile.stats || {};

  return (
    <div className="page">
      <header className="page__header">
        <div className="row" style={{ alignItems: 'center' }}>
          <Avatar user={profile} size="lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="page__title">{profile.displayName || profile.username}</h1>
            <p className="page__subtitle">
              @{profile.username}
              {profile.homeIata && (
                <>
                  {' '}
                  · Hemma: <Link to={`/airport/${profile.homeIata}`}>{profile.homeIata}</Link>
                </>
              )}
            </p>
          </div>
          {isMe && !editing && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
              Redigera
            </button>
          )}
        </div>
      </header>

      {editing && (
        <EditProfile
          profile={profile}
          onCancel={() => setEditing(false)}
          onSaved={(u) => {
            setData((p) => ({ ...p, ...u }));
            setEditing(false);
          }}
        />
      )}

      <section className="section" aria-label="Statistik">
        <div className="grid grid--2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <Stat value={st.uniqueAirports ?? 0} label="Flygplatser" />
          <Stat value={st.countries ?? 0} label="Länder" />
          <Stat value={st.continents ?? 0} label="Kontinenter" />
          <Stat value={st.totalCheckins ?? 0} label="Check-ins" />
        </div>
        {st.avgGivenRating != null && (
          <p className="muted" style={{ textAlign: 'center' }}>
            Snittbetyg givet: {formatRating(st.avgGivenRating)}
          </p>
        )}
      </section>

      <Tabs
        label="Profilflikar"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'airports', label: isMe ? 'Mina flygplatser' : 'Flygplatser' },
          { value: 'checkins', label: 'Check-ins' },
          { value: 'badges', label: 'Märken' },
          { value: 'wishlist', label: 'Önskelista' },
          { value: 'map', label: 'Karta' }
        ]}
      />
      <div role="tabpanel" aria-labelledby={`tab-${tab}`} style={{ marginTop: 16 }}>
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
        {tab === 'wishlist' && <WishlistTab username={username} isMe={isMe} />}
      </div>
    </div>
  );
}
