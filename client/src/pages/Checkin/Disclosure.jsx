/** Hopfällbar sektion (inbyggd <details>, tillgänglig utan extra ARIA). */
export function Disclosure({ title, summary, defaultOpen = false, children }) {
  return (
    <details className="disclosure" open={defaultOpen || undefined}>
      <summary className="disclosure__summary">
        <span className="disclosure__title">{title}</span>
        {summary && <span className="disclosure__meta">{summary}</span>}
      </summary>
      <div className="disclosure__body">{children}</div>
    </details>
  );
}
