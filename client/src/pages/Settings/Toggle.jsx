/** Inställningsrad med reglage (checkbox med role=switch). Används i en .setting-list. */
export function Toggle({ label, hint, checked, onChange, disabled }) {
  return (
    <label className="setting-row">
      <span className="setting-row__text">
        <span className="setting-row__title">{label}</span>
        {hint && <span className="setting-row__desc">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={!!checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
