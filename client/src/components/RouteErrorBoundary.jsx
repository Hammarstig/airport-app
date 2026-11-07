import { Component } from 'react';

/**
 * Felgräns runt lat-laddade sidor. Om en sidas kod inte kan hämtas (t.ex. offline innan
 * service workern har cachat den) visas ett meddelande med "Försök igen" i stället för vit sida.
 * resetKey (sökvägen) nollställer felet vid navigering.
 */
export class RouteErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('Sidan kunde inte visas:', error);
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunk = /dynamically imported module|Loading chunk|Importing a module script failed/i.test(
      String(this.state.error?.message)
    );
    return (
      <div className="page">
        <div className="empty-state" role="alert">
          <p className="bold mt-0">{chunk ? 'Kunde inte ladda sidan' : 'Något gick fel på sidan'}</p>
          <p className="muted">
            {chunk && !navigator.onLine
              ? 'Du är offline och sidan finns inte sparad på enheten ännu. Försök igen när du har nät.'
              : 'Försök igen. Om felet kvarstår, ladda om appen.'}
          </p>
          <div className="row justify-center">
            <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
              Försök igen
            </button>
            <a href="/" className="btn btn--ghost">
              Till flödet
            </a>
          </div>
        </div>
      </div>
    );
  }
}
