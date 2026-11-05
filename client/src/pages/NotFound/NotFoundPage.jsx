import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { EmptyState } from '../../components/ui.jsx';
import { IconPlane } from '../../assets/icons.jsx';

export default function NotFoundPage({ message }) {
  useDocumentTitle('Hittades inte');
  return (
    <div className="page">
      <EmptyState icon={IconPlane} title="Fel gate">
        <p className="muted">{message || 'Sidan du letar efter finns inte.'}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link to="/" className="btn btn--primary">
            Till flödet
          </Link>
          <Link to="/search" className="btn btn--ghost">
            Sök flygplats
          </Link>
        </div>
      </EmptyState>
    </div>
  );
}
