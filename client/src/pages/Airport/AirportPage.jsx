import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { usePaged } from '../../hooks/usePaged.js';
import { continentName, countryName, formatRating } from '../../lib/format.js';
import { CheckinList } from '../../components/CheckinList.jsx';
import { SubRatingBars } from '../../components/SubRatingBars.jsx';
import { LoungeSection } from '../../components/Lounges.jsx';
import { PageSkeleton } from '../../components/Skeleton.jsx';
import { EmptyState, ErrorState, Stars, Stat } from '../../components/ui.jsx';
import { IconMapPin, IconPlane, IconPlus } from '../../assets/icons.jsx';
import NotFoundPage from '../NotFound/NotFoundPage.jsx';
import { ClassMix, PhotoGallery, TopAirlines, WishButton } from './AirportExtras.jsx';

export default function AirportPage() {
  const { iata: raw } = useParams();
  const iata = (raw || '').toUpperCase();
  const {
    data: airport,
    error,
    loading,
    reload
  } = useAsync(
    () => api.airport(iata),
    [iata],
    () => api.peek.airport(iata)
  );
  const [lounges, setLounges] = useState([]);
  const paged = usePaged(
    (limit, offset) => api.airportCheckins(iata, limit, offset),
    [iata],
    20,
    (limit) => api.peek.airportCheckins(iata, limit, 0)
  );
  useDocumentTitle(airport ? `${airport.iata} ${airport.name}` : iata);

  useEffect(() => {
    if (airport) setLounges(airport.lounges || []);
  }, [airport]);

  if (!/^[A-Z]{3}$/.test(iata) || error?.status === 404) {
    return <NotFoundPage message={`Flygplatsen ${iata} finns inte. Endast flygplatser med IATA-kod stöds.`} />;
  }
  if (loading && !airport) return <PageSkeleton />;
  if (error)
    return (
      <div className="page">
        <ErrorState error={error} onRetry={reload} />
      </div>
    );

  const s = airport.stats || {};
  const country = airport.countryName || countryName(airport.country);

  return (
    <div className="page">
      <header className="airport-hero">
        <div className="airport-hero__code" aria-label={`IATA-kod ${airport.iata}`}>
          {airport.iata}
        </div>
        <h1 className="airport-hero__name">{airport.name}</h1>
        <p className="airport-hero__place">
          <IconMapPin size={16} aria-hidden="true" /> {airport.city ? `${airport.city}, ` : ''}
          <Link to={`/country/${airport.country}`}>{country}</Link>
          {airport.continent ? ` · ${continentName(airport.continent)}` : ''}
          {airport.icao ? ` · ICAO ${airport.icao}` : ''}
        </p>
        {airport.myVisits > 0 && (
          <p className="airport-hero__place">
            Du har besökt {airport.iata} {airport.myVisits} {airport.myVisits === 1 ? 'gång' : 'gånger'}.
          </p>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <Link to={`/checkin?iata=${airport.iata}`} className="btn btn--primary">
            <IconPlus size={18} aria-hidden="true" /> Checka in här
          </Link>
          <WishButton key={airport.iata} iata={airport.iata} initial={airport.onMyWishlist} />
        </div>
      </header>

      <section className="section" aria-label="Statistik">
        <div className="grid grid--3">
          <Stat value={s.visitors ?? 0} label="Besökare" />
          <Stat value={s.checkins ?? 0} label="Check-ins" />
          <Stat
            value={formatRating(s.avgRating)}
            label={s.ratingCount ? `Snittbetyg (${s.ratingCount})` : 'Snittbetyg'}
          />
        </div>
        {s.avgRating != null && (
          <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
            <Stars value={s.avgRating} large />
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="sub-title">
        <h2 className="section__title" id="sub-title">
          Delbetyg
        </h2>
        <div className="card">
          <div className="card__body">
            <SubRatingBars averages={s.subAverages} />
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="photos-title">
        <h2 className="section__title" id="photos-title">
          Foton
        </h2>
        <PhotoGallery photos={airport.photos} iata={airport.iata} />
      </section>

      <LoungeSection iata={airport.iata} lounges={lounges} setLounges={setLounges} />

      <div className="grid grid--2">
        <section className="section" aria-labelledby="airlines-title">
          <h2 className="section__title" id="airlines-title">
            Populära flygbolag
          </h2>
          <TopAirlines list={s.topAirlines} />
        </section>
        <section className="section" aria-labelledby="class-title">
          <h2 className="section__title" id="class-title">
            Reseklasser
          </h2>
          <ClassMix mix={s.classMix} />
        </section>
      </div>

      <section className="section" aria-labelledby="checkins-title">
        <h2 className="section__title" id="checkins-title">
          Check-ins
        </h2>
        <CheckinList
          paged={paged}
          hideAirport
          empty={
            <EmptyState icon={IconPlane} title={`Ingen har checkat in på ${airport.iata} ännu`}>
              <Link to={`/checkin?iata=${airport.iata}`} className="btn btn--primary btn--sm">
                Bli först
              </Link>
            </EmptyState>
          }
        />
      </section>
    </div>
  );
}
