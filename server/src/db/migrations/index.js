// Migreringar i ordning. Index i listan + 1 = PRAGMA user_version efter körning. Ändra aldrig en körd migrering.
import m001 from './001-v1-columns.js';
import m002 from './002-v2-social-stats.js';
import m003 from './003-fts-iata.js';
import m004 from './004-v3-privacy-sessions.js';
import m005 from './005-v4-growth.js';
import m006 from './006-autoincrement.js';
import m007 from './007-security.js';

export const MIGRATIONS = [m001, m002, m003, m004, m005, m006, m007];
