// Migreringar i ordning. Index i listan + 1 = PRAGMA user_version efter körning. Ändra aldrig en körd migrering.
import m001 from './001-v1-columns.js';
import m002 from './002-v2-social-stats.js';
import m003 from './003-fts-iata.js';

export const MIGRATIONS = [m001, m002, m003];
