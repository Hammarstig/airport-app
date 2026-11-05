import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { Tabs } from '../../components/ui.jsx';
import { UserBoard } from './UserBoard.jsx';
import { RatedBoard } from './RatedBoard.jsx';

const TABS = [
  { value: 'users', label: 'Resenärer' },
  { value: 'airports', label: 'Flygplatser' }
];

export default function LeaderboardPage() {
  useDocumentTitle('Topplistor');
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'airports' ? 'airports' : 'users';
  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">Topplistor</h1>
        <Link to="/explore" className="btn btn--ghost btn--sm">
          Utforska kategorier
        </Link>
      </header>
      <Tabs
        tabs={TABS}
        value={tab}
        onChange={(t) => setParams(t === 'users' ? {} : { tab: t }, { replace: true })}
        label="Topplistor"
      />
      <div role="tabpanel" aria-labelledby={`tab-${tab}`} className="tabpanel">
        {tab === 'users' ? <UserBoard /> : <RatedBoard />}
      </div>
    </div>
  );
}
