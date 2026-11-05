import { createApp } from './app.js';
import { loadConfig, ConfigError } from './config.js';

const cfg = loadConfig();
let app;
try {
  app = createApp({ staticDir: cfg.staticDir });
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`[gatelog] Startar inte: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
app.listen(cfg.port, () => {
  console.log(`[gatelog] API lyssnar på http://localhost:${cfg.port}`);
});
