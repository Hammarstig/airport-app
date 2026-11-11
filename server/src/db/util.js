// Hjälpare för transaktioner och schemaändringar.

export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Lägger till kolumner som saknas. Returnerar true om någon lades till. */
export function ensureColumns(db, table, cols) {
  const have = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  let added = false;
  for (const [name, def] of cols) {
    if (!have.has(name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
      added = true;
    }
  }
  return added;
}
