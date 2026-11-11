/**
 * Migrering 3: FTS-index med flygplatskod som egen kolumn, så att sök med iata-filter avgörs i indexet,
 * och loungerecensioner indexeras via en vy som ger loungens flygplats.
 */
export default function migration3(db) {
  db.exec(`
    DROP TRIGGER IF EXISTS checkins_ai; DROP TRIGGER IF EXISTS checkins_ad; DROP TRIGGER IF EXISTS checkins_au;
    DROP TRIGGER IF EXISTS lounge_reviews_ai; DROP TRIGGER IF EXISTS lounge_reviews_ad; DROP TRIGGER IF EXISTS lounge_reviews_au;
    DROP TABLE IF EXISTS checkins_fts; DROP TABLE IF EXISTS lounge_reviews_fts;
    CREATE VIEW IF NOT EXISTS lounge_reviews_search AS
      SELECT r.id, r.comment, lo.iata FROM lounge_reviews r JOIN lounges lo ON lo.id = r.lounge_id;
    CREATE VIRTUAL TABLE checkins_fts USING fts5(
      comment, iata, content='checkins', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
    );
    CREATE VIRTUAL TABLE lounge_reviews_fts USING fts5(
      comment, iata, content='lounge_reviews_search', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER checkins_ai AFTER INSERT ON checkins BEGIN
      INSERT INTO checkins_fts(rowid, comment, iata) VALUES (new.id, new.comment, new.iata);
    END;
    CREATE TRIGGER checkins_ad AFTER DELETE ON checkins BEGIN
      INSERT INTO checkins_fts(checkins_fts, rowid, comment, iata) VALUES ('delete', old.id, old.comment, old.iata);
    END;
    CREATE TRIGGER checkins_au AFTER UPDATE OF comment, iata ON checkins BEGIN
      INSERT INTO checkins_fts(checkins_fts, rowid, comment, iata) VALUES ('delete', old.id, old.comment, old.iata);
      INSERT INTO checkins_fts(rowid, comment, iata) VALUES (new.id, new.comment, new.iata);
    END;
    CREATE TRIGGER lounge_reviews_ai AFTER INSERT ON lounge_reviews BEGIN
      INSERT INTO lounge_reviews_fts(rowid, comment, iata) VALUES (new.id, new.comment, (SELECT iata FROM lounges WHERE id = new.lounge_id));
    END;
    CREATE TRIGGER lounge_reviews_ad AFTER DELETE ON lounge_reviews BEGIN
      INSERT INTO lounge_reviews_fts(lounge_reviews_fts, rowid, comment, iata)
        VALUES ('delete', old.id, old.comment, (SELECT iata FROM lounges WHERE id = old.lounge_id));
    END;
    CREATE TRIGGER lounge_reviews_au AFTER UPDATE OF comment ON lounge_reviews BEGIN
      INSERT INTO lounge_reviews_fts(lounge_reviews_fts, rowid, comment, iata)
        SELECT 'delete', old.id, old.comment, (SELECT iata FROM lounges WHERE id = old.lounge_id);
      INSERT INTO lounge_reviews_fts(rowid, comment, iata)
        SELECT new.id, new.comment, (SELECT iata FROM lounges WHERE id = new.lounge_id);
    END;
    INSERT INTO checkins_fts(checkins_fts) VALUES ('rebuild');
    INSERT INTO lounge_reviews_fts(lounge_reviews_fts) VALUES ('rebuild');
  `);
}
