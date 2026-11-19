import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useToast } from '../../components/Toast.jsx';
import { formatDate } from '../../lib/format.js';
import { IconImage, IconPlane, IconPlus, IconTicket } from '../../assets/icons.jsx';

const SOURCES = [
  {
    id: 'flighty',
    label: 'Flighty',
    icon: IconPlane,
    hint: 'I Flighty: Inställningar > Exportera flygningar (CSV). Kolumnerna Date, From, To, Airline och Flight läses.'
  },
  {
    id: 'aita',
    label: 'App in the Air',
    icon: IconTicket,
    hint: 'Exportera dina flygningar som CSV. Datum och från/till-flygplats (IATA eller ICAO) räcker.'
  },
  {
    id: 'csv',
    label: 'Egen CSV',
    icon: IconImage,
    hint: 'Rubrikrad med date och antingen iata eller from/to. Valfritt: airline, flight, class, rating, comment.'
  }
];

const KIND = { departure: 'Avgång', arrival: 'Ankomst', transfer: 'Transfer', layover: 'Mellanlandning' };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const MAX_ROWS = 5000;
const MAX_BYTES = 1024 * 1024;
const STEPS = ['Välj fil', 'Granska', 'Klart'];

function Steps({ step }) {
  return (
    <ol className="import-steps" aria-label="Steg">
      {STEPS.map((s, i) => (
        <li key={s} className={i < step ? 'is-done' : undefined} aria-current={i === step ? 'step' : undefined}>
          {s}
        </li>
      ))}
    </ol>
  );
}

function Preview({ result }) {
  const rows = [
    ...result.preview.map((p) => ({ ...p, ok: true })),
    ...result.skipped.map((s) => ({ line: s.line, reason: s.reason }))
  ].sort((a, b) => a.line - b.line);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="import-preview">
        <caption className="visually-hidden">Förhandsvisning av importen</caption>
        <thead>
          <tr>
            <th scope="col">Rad</th>
            <th scope="col">Datum</th>
            <th scope="col">Flygplats</th>
            <th scope="col">Typ</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.line}-${i}`} className={r.ok ? undefined : 'is-error'}>
              <td>{r.line}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{r.visitedOn || ''}</td>
              <td>{r.iata || ''}</td>
              <td>{r.kind ? KIND[r.kind] || r.kind : ''}</td>
              <td>
                {r.ok ? (
                  <span className="import-status import-status--ok">Ny</span>
                ) : (
                  <span className="import-status import-status--error">{r.reason}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function History() {
  const toast = useToast();
  const { data, setData } = useAsync(
    () => api.imports(),
    [],
    () => api.peek.imports()
  );
  if (!data || data.length === 0) return null;
  const undo = async (imp) => {
    if (!window.confirm(`Ta bort de ${imp.imported} check-ins som importerades ${formatDate(imp.createdAt)}?`)) return;
    try {
      await api.deleteImport(imp.id);
      setData((cur) => cur.filter((x) => x.id !== imp.id));
      toast.show('Importen är borttagen.');
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <section aria-labelledby="imp-hist" className="stack stack--sm">
      <h3 className="field__label mb-0" id="imp-hist">
        Tidigare importer
      </h3>
      <ul className="list">
        {data.map((imp) => (
          <li key={imp.id} className="list__item">
            <span className="flex-1 min-w-0">
              {formatDate(imp.createdAt)} · {imp.imported} av {imp.rows} rader
            </span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => undo(imp)}>
              Ångra
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Import av resehistorik (CSV): välj källa och fil, granska (dryRun) och importera. */
export function ImportSection() {
  const { user } = useAuth();
  const toast = useToast();
  const [source, setSource] = useState('flighty');
  const [over, setOver] = useState(false);
  const [file, setFile] = useState(null); // { name, csv }
  const [result, setResult] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const step = done ? 2 : result ? 1 : 0;

  const pick = async (f) => {
    setError(null);
    setDone(null);
    if (!f) return;
    if (f.size > MAX_BYTES) return setError('Filen är större än 1 MB. Dela upp den i flera filer.');
    setBusy(true);
    try {
      const csv = await f.text();
      // Servern tar högst 5 000 rader (400 annars); säg till direkt i stället för att skicka filen.
      const rows = csv.split(/\r?\n/).filter((l) => l.trim()).length - 1;
      if (rows > MAX_ROWS) {
        setResult(null);
        setError(`Filen har ${rows} rader. Max är 5 000 per import - dela upp den i flera filer.`);
        return;
      }
      setFile({ name: f.name, csv });
      setResult(await api.importCsv(csv, true));
    } catch (e) {
      setResult(null);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    setBusy(true);
    try {
      const res = await api.importCsv(file.csv, false);
      setDone(res);
      setResult(null);
      setFile(null);
      toast.show(`${res.imported} check-ins importerade.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setResult(null);
    setFile(null);
    setDone(null);
    setError(null);
  };

  const hint = SOURCES.find((s) => s.id === source)?.hint;

  return (
    <div className="stack">
      <p className="muted mt-0 mb-0">
        Har du loggat flygningar i en annan app? Importera dem som CSV. Dubbletter hoppas över och importerade check-ins
        syns inte i andras flöden.
      </p>
      <Steps step={step} />

      {step === 0 && (
        <>
          <div className="import-sources" role="group" aria-label="Källa">
            {SOURCES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className="import-source"
                aria-pressed={source === id}
                onClick={() => setSource(id)}
              >
                <Icon size={20} aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
          <p className="muted text-sm mt-0 mb-0">{hint}</p>
          <label
            className={`import-drop${over ? ' import-drop--over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              pick(e.dataTransfer.files?.[0]);
            }}
          >
            <IconPlus size={36} aria-hidden="true" />
            <span className="import-drop__title">{busy ? 'Läser filen...' : 'Välj eller släpp en CSV-fil'}</span>
            <span className="import-drop__hint">Max 1 MB och 5 000 rader</span>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              aria-label="CSV-fil att importera"
              disabled={busy}
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </>
      )}

      {error && (
        <p className="notice notice--danger mt-0 mb-0" role="alert">
          {error}
        </p>
      )}

      {step === 1 && (
        <>
          <p className="mt-0 mb-0" role="status">
            <strong>{file.name}</strong>: {result.rows} rader,{' '}
            {result.preview.length >= 50 ? 'minst 50' : result.preview.length} nya check-ins
            {result.duplicates ? `, ${plural(result.duplicates, 'dubblett', 'dubbletter')} hoppas över` : ''}
            {result.skipped.length ? `, ${plural(result.skipped.length, 'rad', 'rader')} kan inte läsas` : ''}.
          </p>
          {result.preview.length + result.skipped.length > 0 && <Preview result={result} />}
          {result.preview.length >= 50 && (
            <p className="muted text-sm mt-0 mb-0">Förhandsvisningen visar de 50 första raderna.</p>
          )}
          <div className="row">
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || result.preview.length === 0}
              onClick={run}
            >
              {busy
                ? 'Importerar...'
                : result.preview.length >= 50
                  ? 'Importera alla'
                  : `Importera ${result.preview.length} check-ins`}
            </button>
            <button type="button" className="btn btn--ghost" onClick={reset}>
              Avbryt
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <p className="notice mt-0 mb-0" role="status">
            {done.imported} check-ins importerade
            {done.duplicates ? `, ${plural(done.duplicates, 'dubblett', 'dubbletter')} hoppades över` : ''}. Märken och
            statistik är uppdaterade.
          </p>
          <div className="row">
            <Link to={`/u/${user.username}`} className="btn btn--primary">
              Visa min profil
            </Link>
            <button type="button" className="btn btn--ghost" onClick={reset}>
              Importera fler
            </button>
          </div>
        </>
      )}

      <History key={done?.id ?? 'h'} />
    </div>
  );
}
