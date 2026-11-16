// Migrering 6: AUTOINCREMENT för check-ins och kommentarer (BUG-12). Utan AUTOINCREMENT kan SQLite
// återanvända id:t för den senast raderade raden, så att en gammal länk (/c/123) eller notis pekar på
// någon annans nya check-in. Tabellerna byggs om enligt SQLites tolvstegsmetod (index och triggers sparas
// och återskapas). Kräver att främmande nycklar är avslagna under migreringen (se noForeignKeys).

function rebuildWithAutoincrement(db, table) {
  const create = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table).sql;
  if (/AUTOINCREMENT/i.test(create)) return;
  const deps = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name = ? AND type IN ('index', 'trigger') AND sql IS NOT NULL")
    .all(table).map((r) => r.sql);
  const tmp = `${table}_ai`;
  const newSql = create
    .replace(new RegExp(`^CREATE TABLE (IF NOT EXISTS )?"?${table}"?`, 'i'), `CREATE TABLE ${tmp}`)
    .replace(/\bid\s+INTEGER PRIMARY KEY\b/i, 'id INTEGER PRIMARY KEY AUTOINCREMENT');
  db.exec(newSql);
  db.exec(`INSERT INTO ${tmp} SELECT * FROM ${table}`);
  db.exec(`DROP TABLE ${table}`);
  // legacy_alter_table: triggers på andra tabeller som refererar till tabellen kontrolleras inte vid
  // namnbytet (de pekar på det slutliga namnet och fungerar efteråt).
  db.exec('PRAGMA legacy_alter_table = ON');
  try {
    db.exec(`ALTER TABLE ${tmp} RENAME TO ${table}`);
  } finally {
    db.exec('PRAGMA legacy_alter_table = OFF');
  }
  for (const sql of deps) db.exec(sql);
}

export default function migration6(db) {
  rebuildWithAutoincrement(db, 'checkins');
  rebuildWithAutoincrement(db, 'comments');
}
migration6.noForeignKeys = true;
