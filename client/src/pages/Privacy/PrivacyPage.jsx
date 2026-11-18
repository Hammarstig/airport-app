import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';

// Kontaktvägen sätts vid bygget (VITE_PRIVACY_CONTACT) av den organisation som driver tjänsten.
const CONTACT = import.meta.env.VITE_PRIVACY_CONTACT || 'integritet@gatelog.app';
const CONTROLLER = import.meta.env.VITE_PRIVACY_CONTROLLER || 'Gatelog (tjänstens ägare)';
export const PRIVACY_UPDATED = '2026-11-18';

function Section({ id, title, children }) {
  return (
    <section className="card" aria-labelledby={id}>
      <div className="card__body stack">
        <h2 className="section__title mt-0 mb-0" id={id}>
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

/** Integritetspolicy (GDPR art. 12-14): vilka data, varför, hur länge, vem som får dem, dina rättigheter. */
export default function PrivacyPage() {
  useDocumentTitle('Integritetspolicy');
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <header className="page__header">
        <h1 className="page__title">Integritetspolicy</h1>
        <p className="page__subtitle">Senast uppdaterad {PRIVACY_UPDATED}</p>
      </header>
      <div className="stack stack--lg">
        <Section id="pp-short" title="Kort sagt">
          <ul className="stack stack--sm">
            <li>Vi sparar det du själv loggar: flygplatser, datum, betyg, kommentarer och foton.</li>
            <li>
              Var och när du reser är känsligt. Du bestämmer vem som ser dina check-ins och kan fördröja dem, under{' '}
              <Link to="/settings/integritet">Inställningar &gt; Integritet</Link>.
            </li>
            <li>Vi säljer inte dina uppgifter och visar ingen reklam.</li>
            <li>
              Du kan när som helst exportera allt eller radera kontot under{' '}
              <Link to="/settings/data">Inställningar &gt; Data</Link>.
            </li>
          </ul>
        </Section>

        <Section id="pp-who" title="Personuppgiftsansvarig och kontakt">
          <p className="mt-0 mb-0">
            Personuppgiftsansvarig är {CONTROLLER}. Frågor om dina uppgifter eller om du vill använda dina rättigheter:{' '}
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Vi svarar inom en månad.
          </p>
        </Section>

        <Section id="pp-what" title="Vilka uppgifter vi behandlar och varför">
          <div style={{ overflowX: 'auto' }}>
            <table className="import-preview">
              <caption className="visually-hidden">Uppgifter, ändamål och rättslig grund</caption>
              <thead>
                <tr>
                  <th scope="col">Uppgifter</th>
                  <th scope="col">Ändamål</th>
                  <th scope="col">Rättslig grund</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Användarnamn, visningsnamn, lösenord (bara som hash), hemmaflygplats</td>
                  <td>Ditt konto och din profil</td>
                  <td>Avtal (art. 6.1 b)</td>
                </tr>
                <tr>
                  <td>Check-ins: flygplats, datum, typ, flygbolag, flight, klass, betyg, kommentar, foton</td>
                  <td>Din resedagbok, statistik, märken och topplistor</td>
                  <td>Avtal (art. 6.1 b)</td>
                </tr>
                <tr>
                  <td>Följningar, gillningar, kommentarer, blockeringar, inbjudningar</td>
                  <td>De sociala funktionerna</td>
                  <td>Avtal (art. 6.1 b)</td>
                </tr>
                <tr>
                  <td>Inloggade enheter (webbläsare, operativsystem, tid)</td>
                  <td>Säkerhet: se och logga ut enheter, upptäcka missbruk</td>
                  <td>Berättigat intresse (art. 6.1 f)</td>
                </tr>
                <tr>
                  <td>Rapporter och modereringsbeslut</td>
                  <td>Hantera olämpligt innehåll</td>
                  <td>Berättigat intresse (art. 6.1 f)</td>
                </tr>
                <tr>
                  <td>Pushprenumeration (adress hos webbläsarens pushtjänst)</td>
                  <td>Skicka notiser du valt</td>
                  <td>Samtycke (art. 6.1 a), kan återkallas i inställningarna</td>
                </tr>
                <tr>
                  <td>Ungefärlig position (bara när du trycker &quot;Visa flygplatser nära mig&quot;)</td>
                  <td>Föreslå flygplatser nära dig. Positionen sparas inte.</td>
                  <td>Samtycke (art. 6.1 a)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted text-sm mt-0 mb-0">
            Platsinformation i foton (EXIF/GPS) tas bort när fotot laddas upp. Vid import av resehistorik sparas bara de
            rader som blir check-ins, inte själva filen.
          </p>
        </Section>

        <Section id="pp-see" title="Vem som ser vad">
          <ul className="stack stack--sm">
            <li>
              Publika check-ins syns för alla, även utloggade besökare. Med &quot;Följare&quot; eller &quot;Bara jag&quot; syns de bara för
              godkända följare respektive dig själv.
            </li>
            <li>Med privat profil måste du godkänna nya följare.</li>
            <li>Fördröjning gör att andra ser check-in:en först efter vald tid.</li>
            <li>Moderatorer kan se rapporterat innehåll för att hantera rapporten.</li>
          </ul>
        </Section>

        <Section id="pp-share" title="Mottagare">
          <p className="mt-0 mb-0">
            Vi delar inte dina uppgifter med andra företag. Pushnotiser går via din webbläsares pushtjänst (Google,
            Mozilla eller Apple beroende på webbläsare); de får bara själva notisen och en anonym adress. Data om
            flygplatser, flygbolag och kartor kommer från öppna källor (se <Link to="/about">Om Gatelog</Link>) och
            ingen av dem får uppgifter om dig.
          </p>
        </Section>

        <Section id="pp-time" title="Hur länge vi sparar uppgifterna">
          <ul className="stack stack--sm">
            <li>Konto, check-ins och socialt innehåll: tills du raderar dem eller kontot.</li>
            <li>Inloggningar: en session gäller i högst 30 dagar utan användning och tas bort när du loggar ut.</li>
            <li>Inbjudningslänkar: 90 dagar.</li>
            <li>Rapporter och modereringslogg: så länge det behövs för att hantera ärendet och förhindra missbruk.</li>
            <li>
              Raderar du kontot tas profil, check-ins, foton, kommentarer, gillningar, följningar, sessioner och
              pushprenumerationer bort.
            </li>
          </ul>
        </Section>

        <Section id="pp-device" title="På din enhet">
          <p className="mt-0 mb-0">
            Appen sparar på enheten: vem som är inloggad, senaste flygplatser, tema och check-ins som väntar på nät.
            Ingen spårning eller tredjepartskakor. Inloggningen använder en nödvändig kaka (HttpOnly). När du loggar ut
            rensas personlig data på enheten, även osända check-ins, och pushnotiser stängs av.
          </p>
        </Section>

        <Section id="pp-rights" title="Dina rättigheter">
          <ul className="stack stack--sm">
            <li>
              Få tillgång till och flytta dina uppgifter (art. 15 och 20): <Link to="/settings/data">Exportera</Link>{' '}
              ger all din data som JSON.
            </li>
            <li>Rätta uppgifter (art. 16): ändra profil och check-ins direkt i appen.</li>
            <li>
              Radera (art. 17): radera enskilda check-ins eller hela kontot under{' '}
              <Link to="/settings/data">Inställningar &gt; Data</Link>.
            </li>
            <li>
              Invända och begränsa (art. 18 och 21) samt återkalla samtycke: kontakta oss eller ändra inställningarna.
            </li>
            <li>
              Klaga hos tillsynsmyndigheten:{' '}
              <a href="https://www.imy.se" rel="noopener noreferrer" target="_blank">
                Integritetsskyddsmyndigheten (IMY)
              </a>
              .
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
