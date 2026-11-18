import { createHash } from 'node:crypto';

/**
 * Vite-plugin: lägger till ett litet klassiskt skript (boot-*.js, async) i index.html som vid
 * sidladdning lägger <link rel="modulepreload"> för just den sida som öppnas. Sidans kod börjar då
 * laddas parallellt med huvudpaketet i stället för efter att det kört (sparar en rundresa på LCP
 * för delade länkar som /airport/GOT). Inget förhämtas för andra sidor.
 */

// [mönster för sökvägen, sidmodul]. Ordningen spelar roll: första träff vinner.
const ROUTES = [
  ['^/checkin/done$', 'pages/Checkin/DonePage.jsx'],
  ['^/checkin(/[^/]+/edit)?$', 'pages/Checkin/CheckinPage.jsx'],
  ['^/c/[^/]+$', 'pages/CheckinDetail/CheckinDetailPage.jsx'],
  ['^/airport/[^/]+$', 'pages/Airport/AirportPage.jsx'],
  ['^/u/[^/]+/(followers|following)$', 'pages/Profile/FollowPage.jsx'],
  ['^/u/[^/]+$', 'pages/Profile/ProfilePage.jsx'],
  ['^/(search|explore)$', 'pages/Search/SearchPage.jsx'],
  ['^/leaderboard$', 'pages/Leaderboard/LeaderboardPage.jsx'],
  ['^/country/[^/]+$', 'pages/Country/CountryPage.jsx'],
  ['^/top/[^/]+$', 'pages/Top/TopPage.jsx'],
  ['^/lounge/[^/]+$', 'pages/Lounge/LoungePage.jsx'],
  ['^/login$', 'pages/Auth/LoginPage.jsx'],
  ['^/privacy$', 'pages/Privacy/PrivacyPage.jsx'],
  ['^/register$', 'pages/Auth/RegisterPage.jsx']
];

export function routePreload() {
  return {
    name: 'gatelog-route-preload',
    apply: 'build',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      const chunks = Object.values(bundle).filter((c) => c.type === 'chunk');
      const entry = chunks.find((c) => c.isEntry);
      if (!entry) return;
      // Det som huvudpaketet redan laddar behöver inte förladdas.
      const inEntry = new Set([entry.fileName, ...entry.imports]);
      const byFile = new Map(chunks.map((c) => [c.fileName, c]));
      const closure = (chunk) => {
        const out = new Set();
        const walk = (c) => {
          if (!c || out.has(c.fileName) || inEntry.has(c.fileName)) return;
          out.add(c.fileName);
          c.imports.forEach((f) => walk(byFile.get(f)));
        };
        walk(chunk);
        return [...out];
      };
      const table = [];
      for (const [pattern, mod] of ROUTES) {
        const chunk = chunks.find((c) => c.facadeModuleId?.endsWith(`/src/${mod}`));
        if (chunk) table.push([pattern, closure(chunk)]);
      }
      const code =
        `(function(){var t=${JSON.stringify(table)},p=location.pathname.replace(/\\/+$/,'')||'/';` +
        `for(var i=0;i<t.length;i++)if(new RegExp(t[i][0]).test(p)){t[i][1].forEach(function(f){` +
        `var l=document.createElement('link');l.rel='modulepreload';l.href='/'+f;document.head.appendChild(l)});break}})();\n`;
      const hash = createHash('sha256').update(code).digest('hex').slice(0, 8);
      const fileName = `assets/boot-${hash}.js`;
      this.emitFile({ type: 'asset', fileName, source: code });
      // index.html är redan skapad (enforce: post); skriptet läggs först i <head> så att det hämtas tidigt.
      const html = bundle['index.html'];
      if (html?.type === 'asset')
        html.source = String(html.source).replace('<head>', `<head>\n    <script async src="/${fileName}"></script>`);
    }
  };
}
