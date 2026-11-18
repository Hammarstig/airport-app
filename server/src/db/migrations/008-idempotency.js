// Migrering 8 (SEC-11): idempotensnyckel för check-ins från klientens offlinekö.
import { ensureColumns } from '../util.js';

export default function migration8(db) {
  ensureColumns(db, 'checkins', [['client_key', 'TEXT']]);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_client_key ON checkins(user_id, client_key) WHERE client_key IS NOT NULL;');
}
