import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 8787;
const staticDir = process.env.STATIC_DIR || resolve(here, '../../client/dist');

const app = createApp({ dbPath: process.env.DB_PATH, staticDir });
app.listen(port, () => {
  console.log(`[gatelog] API lyssnar på http://localhost:${port}`);
});
