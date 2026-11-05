// Skapar demoanvändare med check-ins, lounger, recensioner, likes och önskelistor.
// Kör: npm run seed:demo -w server   (DB_PATH styr databasfil, default server/data/gatelog.db)
// Befintliga demoanvändare tas bort och skapas om, så skriptet kan köras flera gånger.
import bcrypt from 'bcryptjs';
import { openDb, transaction } from '../src/db.js';

const PASSWORD = 'demo1234';

const USERS = [
  { username: 'oliver', displayName: 'Oliver H', home: 'GOT' },
  { username: 'anna', displayName: 'Anna Lind', home: 'ARN' },
  { username: 'mads', displayName: 'Mads Jensen', home: 'CPH' },
  { username: 'sarah', displayName: 'Sarah Miles', home: 'LHR' },
];

// Delbetyg: [security, cleanliness, food, wifi, transfer, lounges]
// lounge: [namn, terminal, loungebetyg, loungekommentar]
const CHECKINS = [
  // oliver: många besök på hemmaflygplatsen, Norden runt, låser upp flera märken
  ['oliver', 'GOT', '2026-01-12', 'departure', 4, [4, 5, 3, 4, null, 4], 'SK', 'economy', 'SK151', 'Snabb säkerhetskontroll en tisdagsmorgon, bra kaffe vid gate 14.', ['SAS Lounge', null, 4, 'Lugnt och fint, bra frukost.']],
  ['oliver', 'CPH', '2026-01-12', 'transfer', 4.5, [4, 4, 4, 5, 5, null], 'SK', 'economy', 'SK1421', 'Kastrup är bäst i Norden för byten. Skyltningen är tydlig och gångavstånden rimliga.', null],
  ['oliver', 'FRA', '2026-02-03', 'transfer', 3, [2, 4, 3, 3, 2, 4], 'LH', 'business', 'LH807', 'Lång promenad mellan Z- och A-gaterna, och passkontrollen tog 40 minuter.', ['Lufthansa Senator Lounge', 'Terminal 1', 4.5, 'Mycket bra lounge, lugn och gott vin.']],
  ['oliver', 'GOT', '2026-02-20', 'arrival', 4, [null, 5, null, 4, null, null], 'DY', 'economy', 'DY4012', null, null],
  ['oliver', 'OSL', '2026-03-08', 'departure', 4.5, [4, 5, 4, 4, null, 3], 'DY', 'economy', 'DY1302', 'Gardermoen är ljus och luftig med mycket trä. Dyr mat men bra kvalitet.', null],
  ['oliver', 'HEL', '2026-03-22', 'transfer', 5, [5, 5, 4, 5, 5, 5], 'AY', 'business', 'AY1594', 'Smidigaste transfern jag gjort, Schengen till non-Schengen på tio minuter.', ['Finnair Platinum Wing', 'Non-Schengen', 5, 'Bastu i loungen. Mer behöver inte sägas.']],
  ['oliver', 'GOT', '2026-04-15', 'departure', 3.5, [3, 4, 3, 4, null, null], 'KL', 'economy', 'KL1158', 'Kö i säkerhetskontrollen vid sju på morgonen, ta god tid på dig.', null],
  ['oliver', 'AMS', '2026-04-15', 'transfer', 4, [3, 4, 4, 4, 4, null], 'KL', 'economy', 'KL871', 'Schiphol är enormt men logiskt. Bra wifi.', null],
  ['oliver', 'KEF', '2026-05-30', 'arrival', 3.5, [null, 4, 2, 4, null, null], 'FI', 'economy', 'FI307', 'Liten men effektiv. Maten är dyr även för isländska mått.', null],
  ['oliver', 'GOT', '2026-06-02', 'arrival', 4, [null, 5, null, 4, null, null], 'FI', 'economy', 'FI306', null, null],
  ['oliver', 'DOH', '2026-08-10', 'transfer', 5, [4, 5, 5, 5, 5, 5], 'QR', 'business', 'QR160', 'Hamad är imponerande. Den stora gula nallen och lugnet gör transfern till en upplevelse.', ['Al Mourjan Business Lounge', null, 5, 'Världsklass. Bra mat och tyst sovrum.']],
  ['oliver', 'SIN', '2026-08-11', 'arrival', 5, [5, 5, 5, 5, 4, null], 'QR', 'business', 'QR946', 'Changi är fortfarande bäst i världen. Jewel-fontänen är värd ett eget besök.', null],
  ['oliver', 'GOT', '2026-09-18', 'departure', 4, [4, 5, 3, 4, null, 4], 'SK', 'economy', 'SK153', 'Ny matbutik efter säkerhetskontrollen, äntligen bra smörgåsar.', null],
  ['oliver', 'ARN', '2026-10-02', 'transfer', 3.5, [3, 4, 3, 4, 3, null], 'SK', 'economy', 'SK1', 'Terminal 5 behöver renoveras, men lounge och wifi fungerar.', null],

  // anna
  ['anna', 'ARN', '2026-02-11', 'departure', 3.5, [3, 4, 3, 4, null, 4], 'SK', 'economy', 'SK525', 'Långa köer i säkerhetskontrollen i T5 en måndagsmorgon.', ['SAS Gold Lounge', 'Terminal 5', 3.5, 'Trångt på morgonen men bra kaffe.']],
  ['anna', 'LHR', '2026-02-11', 'arrival', 3, [2, 3, 4, 3, null, null], 'SK', 'economy', 'SK525', 'Heathrow T2 är fint men passkontrollen tog en timme.', null],
  ['anna', 'CDG', '2026-04-04', 'transfer', 2, [2, 2, 3, 2, 1, null], 'AF', 'economy', 'AF1263', 'Charles de Gaulle är en labyrint. Missade nästan anslutningen, dålig skyltning.', null],
  ['anna', 'JFK', '2026-04-04', 'arrival', 2.5, [2, 2, 3, 3, null, null], 'AF', 'premium_economy', 'AF006', 'Terminal 1 känns sliten. Taxikön var däremot snabb.', null],
  ['anna', 'DXB', '2026-06-21', 'transfer', 4, [4, 5, 4, 4, 4, 5], 'EK', 'business', 'EK158', 'Enorm flygplats men allt fungerar. Långt till gaten med tåget.', ['Emirates Business Lounge', 'Concourse B', 4.5, 'Stor, bra buffé, tyst vid A-sidan.']],
  ['anna', 'SIN', '2026-06-22', 'arrival', 5, [5, 5, 5, 5, null, null], 'EK', 'business', 'EK432', 'Fantastiskt! Grönska överallt och supersnabb immigration.', null],

  // mads (engelska kommentarer)
  ['mads', 'CPH', '2026-03-01', 'departure', 4.5, [4, 5, 4, 5, null, 4], 'SK', 'business', 'SK903', 'Quick security, great food court and the best design in Scandinavia.', ['Aviator Lounge', 'Terminal 3', 3.5, 'Decent lounge, a bit crowded.']],
  ['mads', 'IST', '2026-03-14', 'transfer', 4, [3, 4, 5, 4, 3, 5], 'TK', 'business', 'TK1784', 'Huge new airport. Long walks, but the lounge is incredible.', ['Turkish Airlines Lounge', null, 5, 'Best lounge food anywhere, the pide station is amazing.']],
  ['mads', 'HAD', '2026-05-05', 'arrival', 4, [null, 4, 2, 3, null, null], null, 'economy', null, 'Tiny and cosy. Five minutes from plane to parking.', null],
  ['mads', 'AMS', '2026-07-19', 'transfer', 3.5, [3, 4, 4, 4, 3, null], 'KL', 'economy', 'KL1128', 'Security at Schiphol was chaotic in July, allow extra time.', null],
  ['mads', 'LHR', '2026-09-03', 'arrival', 3, [3, 3, 3, 3, 3, null], 'BA', 'economy', 'BA815', 'Heathrow Terminal 5 is efficient but the walk to baggage is long.', null],
  ['mads', 'FRA', '2026-10-12', 'departure', 3.5, [3, 4, 3, 4, null, null], 'LH', 'economy', 'LH831', 'Frankfurt works, but it is not a pleasant place to wait.', null],

  // sarah (engelska kommentarer)
  ['sarah', 'LHR', '2026-01-20', 'departure', 4, [3, 4, 4, 4, null, 5], 'BA', 'first', 'BA11', 'Fast track and the Concorde Room make Heathrow a different airport.', ['Concorde Room', 'Terminal 5', 5, 'Proper dining, excellent service.']],
  ['sarah', 'SIN', '2026-01-21', 'arrival', 5, [5, 5, 5, 5, null, null], 'BA', 'first', 'BA11', 'Changi sets the bar. Clean, calm and the immigration was instant.', null],
  ['sarah', 'DOH', '2026-03-30', 'transfer', 4.5, [4, 5, 4, 5, 5, 5], 'QR', 'business', 'QR8', 'Seamless transfer, the lounge was the highlight.', null],
  ['sarah', 'JFK', '2026-06-14', 'arrival', 2, [1, 2, 3, 2, null, null], 'BA', 'business', 'BA117', 'Terminal 7 at JFK is tired. Long queues at immigration.', null],
  ['sarah', 'GOT', '2026-07-08', 'arrival', 4.5, [null, 5, null, 4, null, null], 'KL', 'economy', 'KL1157', 'Lovely small airport, the Flygbussarna coach to the city is easy.', null],
  ['sarah', 'CPH', '2026-07-12', 'departure', 4.5, [4, 5, 5, 5, null, null], 'SK', 'economy', 'SK501', 'Copenhagen airport has great food, try the smørrebrød.', null],
];

const LIKES = [
  ['anna', 'oliver', 'DOH'], ['mads', 'oliver', 'HEL'], ['sarah', 'oliver', 'SIN'], ['anna', 'oliver', 'HEL'],
  ['oliver', 'anna', 'CDG'], ['oliver', 'mads', 'IST'], ['sarah', 'mads', 'IST'], ['oliver', 'sarah', 'LHR'],
  ['mads', 'sarah', 'SIN'], ['anna', 'sarah', 'GOT'],
];

const WISHLIST = {
  oliver: ['HND', 'SYD', 'CPT', 'GRU'],
  anna: ['HEL', 'DOH', 'ICN'],
  mads: ['SIN', 'DXB'],
  sarah: ['KEF', 'HEL', 'OSL'],
};

export function seedDemo(db) {
  const hash = bcrypt.hashSync(PASSWORD, 10);
  const ids = {};
  const checkinIds = {};
  const ts = Date.parse('2026-01-01T00:00:00Z');
  const stamp = (date, plusMin = 0) => new Date(Date.parse(date + 'T09:00:00Z') + plusMin * 60000).toISOString();

  transaction(db, () => {
    const del = db.prepare('DELETE FROM users WHERE username = ?');
    for (const u of USERS) del.run(u.username);

    const insUser = db.prepare('INSERT INTO users (username, password_hash, display_name, home_iata, created_at) VALUES (?, ?, ?, ?, ?)');
    for (const u of USERS) {
      ids[u.username] = Number(insUser.run(u.username, hash, u.displayName, u.home, new Date(ts).toISOString()).lastInsertRowid);
    }

    const findLounge = db.prepare('SELECT id FROM lounges WHERE iata = ? AND lower(name) = lower(?)');
    const insLounge = db.prepare('INSERT INTO lounges (iata, name, terminal, created_by, created_at) VALUES (?, ?, ?, ?, ?)');
    const insCheckin = db.prepare(`INSERT INTO checkins
      (user_id, iata, visited_on, kind, rating, r_security, r_cleanliness, r_food, r_wifi, r_transfer, r_lounges,
       comment, created_at, airline_iata, travel_class, lounge_id, flight_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insReview = db.prepare(`INSERT INTO lounge_reviews (lounge_id, user_id, rating, comment, visited_on, created_at, checkin_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);

    CHECKINS.forEach(([user, iata, date, kind, rating, rt, airline, cls, flight, comment, lounge], i) => {
      const created = stamp(date, i);
      let loungeId = null;
      if (lounge) {
        const [name, terminal] = lounge;
        const found = findLounge.get(iata, name);
        loungeId = found ? found.id : Number(insLounge.run(iata, name, terminal, ids[user], created).lastInsertRowid);
      }
      const id = Number(insCheckin.run(ids[user], iata, date, kind, rating, ...rt, comment, created,
        airline, cls, loungeId, flight).lastInsertRowid);
      checkinIds[`${user}:${iata}`] ??= id;
      if (lounge) insReview.run(loungeId, ids[user], lounge[2], lounge[3], date, created, id);
    });

    // Fristående loungerecension (utan check-in)
    const sk = findLounge.get('GOT', 'SAS Lounge');
    if (sk) insReview.run(sk.id, ids.anna, 3.5, 'Liten men trivsam lounge, bra utsikt över plattan.', '2026-05-14', stamp('2026-05-14'), null);

    const insLike = db.prepare('INSERT OR IGNORE INTO likes (checkin_id, user_id, created_at) VALUES (?, ?, ?)');
    for (const [liker, owner, iata] of LIKES) {
      const cid = checkinIds[`${owner}:${iata}`];
      if (cid) insLike.run(cid, ids[liker], new Date().toISOString());
    }

    const insWish = db.prepare('INSERT OR IGNORE INTO wishlist (user_id, iata, added_at) VALUES (?, ?, ?)');
    for (const [user, list] of Object.entries(WISHLIST)) {
      list.forEach((iata, i) => insWish.run(ids[user], iata, stamp('2026-10-01', i)));
    }
  });
  return { users: USERS.length, checkins: CHECKINS.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = openDb();
  const r = seedDemo(db);
  console.log(`[seed-demo] Skapade ${r.users} användare (lösenord "${PASSWORD}") och ${r.checkins} check-ins.`);
  db.close();
}
