import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { CheckinCard } from '../../components/CheckinCard.jsx';
import { TravelDetailList } from '../../components/TravelDetails.jsx';
import { Comments } from '../../components/Comments.jsx';
import { PageSkeleton } from '../../components/Skeleton.jsx';
import { ErrorState } from '../../components/ui.jsx';
import NotFoundPage from '../NotFound/NotFoundPage.jsx';

/** En check-in med alla detaljer och kommentarer. Delbar länk: /c/:id */
export default function CheckinDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    data: c,
    loading,
    error,
    reload
  } = useAsync(
    () => api.checkin(id),
    [id],
    () => api.peek.checkin(id)
  );
  useDocumentTitle(c ? `${c.user.displayName || c.user.username} på ${c.airport.iata}` : 'Check-in');

  if (error?.status === 404) return <NotFoundPage message="Check-in:en finns inte (den kan ha raderats)." />;
  if (loading && !c) return <PageSkeleton />;
  if (error)
    return (
      <div className="page">
        <ErrorState error={error} onRetry={reload} />
      </div>
    );

  return (
    <div className="page stack stack--lg">
      <CheckinCard checkin={c} linkComments={false} onDelete={() => navigate(-1)} />
      <TravelDetailList checkin={c} />
      <Comments checkinId={c.id} />
    </div>
  );
}
