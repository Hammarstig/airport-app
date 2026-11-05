import { IconFlame } from '../assets/icons.jsx';

/** Nivåmätare (split-flap-bricka + XP mot nästa nivå). info = Level från API:t. */
export function LevelBar({ info, compact = false }) {
  if (!info) return null;
  const span = Math.max(1, info.nextLevelXp - info.levelXp);
  const into = Math.max(0, info.xp - info.levelXp);
  const pct = Math.min(100, Math.round((into / span) * 100));
  return (
    <div className={`level-bar${compact ? ' level-bar--compact' : ''}`} style={{ '--value': pct }}>
      <span className="level-bar__level" aria-hidden="true">
        <span>
          <small>NIVÅ</small>
          {info.level}
        </span>
      </span>
      <span className="level-bar__title">
        Nivå {info.level} - {info.title}
      </span>
      <span
        className="level-bar__track"
        role="progressbar"
        aria-label={`Framsteg mot nivå ${info.level + 1}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${into} av ${span} XP till nivå ${info.level + 1}`}
      />
      <span className="level-bar__meta">
        <span>{info.xp.toLocaleString('sv-SE')} XP</span>
        <span>
          {(info.nextLevelXp - info.xp).toLocaleString('sv-SE')} kvar till nivå {info.level + 1}
        </span>
      </span>
    </div>
  );
}

/** Veckostreak: flamma + "3 veckor i rad". */
export function StreakChip({ streak, large = false }) {
  if (!streak) return null;
  const n = streak.current || 0;
  const cold = n === 0;
  return (
    <span
      className={`streak${streak.thisWeek ? ' streak--active' : ''}${cold ? ' streak--cold' : ''}${large ? ' streak--lg' : ''}`}
      title={`Längsta streak: ${streak.longest} veckor`}
    >
      <IconFlame size={large ? 22 : 16} aria-hidden="true" />
      <span className="streak__count">{n}</span>
      <span className="streak__unit">{n === 1 ? 'vecka i rad' : 'veckor i rad'}</span>
    </span>
  );
}

/** Nivå som liten bricka efter ett namn i listor. */
export function LevelPill({ level }) {
  if (!level) return null;
  return <span className="badge">Nivå {level}</span>;
}
