import { Link } from 'react-router-dom';
import { Avatar, StatRow } from '../../components/ui.jsx';
import { FollowButton } from '../../components/FollowButton.jsx';
import { LevelBar, StreakChip } from '../../components/Level.jsx';
import { ShareButton } from '../../components/ShareButton.jsx';
import { IconSettings } from '../../assets/icons.jsx';

export function ProfileHeader({ profile: p, isMe, onFollowChange }) {
  const st = p.stats || {};
  const name = p.displayName || p.username;
  return (
    <header className="stack">
      <div className="row row--nowrap items-center gap-2">
        <Avatar user={p} size="lg" />
        <div className="flex-1 min-w-0">
          <h1 className="page__title">{name}</h1>
          <p className="page__subtitle">
            @{p.username}
            {p.homeIata && (
              <>
                {' '}
                · Hemma <Link to={`/airport/${p.homeIata}`}>{p.homeIata}</Link>
              </>
            )}
            {p.followsMe && !isMe && <span className="badge"> Följer dig</span>}
          </p>
          <p className="row gap-2 mt-0 mb-0">
            <Link to={`/u/${p.username}/followers`}>
              <strong>{p.followers ?? 0}</strong> följare
            </Link>
            <Link to={`/u/${p.username}/following`}>
              <strong>{p.following ?? 0}</strong> följer
            </Link>
          </p>
        </div>
      </div>
      <div className="row">
        {isMe ? (
          <Link to="/settings" className="btn btn--ghost btn--sm">
            <IconSettings size={18} aria-hidden="true" /> Redigera profil
          </Link>
        ) : (
          <FollowButton username={p.username} initial={p.followedByMe} onChange={onFollowChange} />
        )}
        <ShareButton
          getData={() => ({
            title: `${name} på Gatelog`,
            text: `${name} har besökt ${st.uniqueAirports ?? 0} flygplatser i ${st.countries ?? 0} länder.`,
            url: `/u/${p.username}`
          })}
        />
      </div>
      <LevelBar info={p.levelInfo} />
      <StreakChip streak={p.streak} />
      <StatRow
        label="Statistik"
        items={[
          [st.uniqueAirports ?? 0, 'Flygplatser'],
          [st.countries ?? 0, 'Länder'],
          [st.continents ?? 0, 'Kontinenter'],
          [st.totalCheckins ?? 0, 'Check-ins']
        ]}
      />
    </header>
  );
}
