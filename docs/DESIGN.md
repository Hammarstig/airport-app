# Gatelog - designkontrakt

Grafik-agenten implementerar dessa klasser i `client/src/styles/` (entry: `client/src/styles/index.css`, som bygg-agenten importerar i `main.jsx`). Bygg-agenten använder bara dessa klassnamn (plus egna layout-utilities via inline style vid behov). Grafik-agenten får lägga till klasser men inte döpa om dessa.

## Riktning
Avgångstavla och boardingkort i dagsljus. Ljust tema är huvudtema: ljus himmel som bakgrund, vita ytor, signalgul accent och mörk marin text. Karaktären bärs av detaljer: IATA-koder som split-flap-brickor (mörka brickor med gult tecken och gångjärnslinje), check-in-kort som boardingkort med perforering och stansade hack, streckad "landningsbanemarkering" i signalgult under topbaren och i hero. Mörkt tema (natthimmel) finns som sekundärt.

## Tema
Ljust och mörkt tema via `prefers-color-scheme` + `[data-theme="light"|"dark"]` på `<html>` (attributet vinner). Mobil först (360 px), bottom-nav under 768 px, topbar-nav från 768 px. Max innehållsbredd 1100 px. Respekterar `prefers-reduced-motion`.

### Palett (tokens i `client/src/styles/tokens.css`)
| Token | Ljust | Mörkt | Användning |
|---|---|---|---|
| `--bg` | #F3F7FB | #08111E | Sidbakgrund (ljus himmel / natt) |
| `--surface` / `--surface-2` / `--surface-3` | #FFFFFF / #F7FAFD / #E6EEF6 | #0F1B2C / #15243A / #1C2E47 | Kort, fält, spår |
| `--ink` / `--ink-2` / `--muted` | #14263C / #34465C / #5A6B80 | #E9EEF5 / #C6D0DD / #93A3B8 | Text (alla AA mot bg och surface) |
| `--line` / `--line-strong` | #DCE5EE / #B7C6D6 | #22344D / #34496A | Linjer, kantlinjer |
| `--signal` | #FFBE2E | #FFC22E | Accent: primärknapp, stjärnor, aktiv markering (text ovanpå: `--signal-ink`) |
| `--signal-text` | #8A5600 | #FFCB4F | Signalgul som text på ljus yta |
| `--sky` / `--sky-soft` | #8FCBF5 / #E3F2FD | #3E7FB8 / #12263D | Dekor, hero, premium |
| `--info` `--good` `--mid` `--bad` `--violet` | #1E6BB0 #1D7A4C #9A6200 #B8322A #6A48B8 | ljusare varianter | Länkar/fokus, betygsfärger, chips |
| `--board` / `--board-tile` / `--board-text` | #0F1724 / #1C2635 / #FFC629 | samma | Split-flap (alltid mörk), toast, tooltip |
| `--map-1` ... `--map-6` | #FCEFA6 #C7E9B4 #7FCDBB #41B6C4 #2C7FB8 #253494 | #3B3F7A #33628F #23868F #2DA77E #8CC94F #F5E14A | Choropleth 0-100 %, sekventiell, färgblindvänlig (ljust: YlGnBu, mörkt: viridis-lik) |
| `--map-none` / `--map-border` | #E3EAF1 / #FFFFFF | #1A2B42 / #08111E | Obesökt land, landsgränser |
| `--dot-visited` / `--dot-unvisited` | #FFBE2E / #FFFFFF (+ `-stroke`) | #FFC22E / #0F1B2C | Flygplatsprickar |

Stegindelning för kartan: 0 % = `data-step="0"`, 1-16 = 1, 17-33 = 2, 34-50 = 3, 51-66 = 4, 67-83 = 5, 84-100 = 6.

### Typsnitt (Google Fonts via `@import` i `index.css`)
- **Big Shoulders Display** 700/800 - rubriker, sidtitlar, siffror i stat/rating-badge (kondenserad flygplatsskylt). Fallback Arial Narrow.
- **Atkinson Hyperlegible** 400/700 - brödtext och UI (byggd för läsbarhet, passar skyltning). Fallback system-ui.
- **IBM Plex Mono** 500/600 - endast koder: IATA, flightnummer, gate, plats. Fallback ui-monospace.
Typskala 1.25: 0.8 / 0.875 / 1 / 1.25 / 1.563 / 1.953 / 2.441 / 3.052 rem.

### Touch
Alla interaktiva kontroller har minst 48x48 px träffyta (Android). Visuellt mindre kontroller (`.btn--sm`, `.chip`, `.like-btn`, `.segmented__option`, `.wish-btn`) får en osynlig utökad träffyta via `::after`. Bottom-nav och toast tar hänsyn till `env(safe-area-inset-bottom)`; `index.html` bör ha `viewport-fit=cover`.

## Layout
`.app-shell`, `.topbar`, `.topbar__brand`, `.topbar__nav`, `.topbar__link`, `.topbar__link--active`, `.bottom-nav` (mobil), `.bottom-nav__item`, `.bottom-nav__item--active`, `.page`, `.page__header`, `.page__title`, `.page__subtitle`, `.section`, `.section__title`, `.grid`, `.grid--2`, `.grid--3`, `.stack` (vertikal gap), `.row` (horisontell flex, gap, wrap), `.spacer`
Tillagt: `.stack--sm`, `.stack--lg`, `.row--between`, `.row--nowrap`, `.skip-link` (tillsammans med `.visually-hidden`, syns vid fokus), `.toast-region` (fast behållare för toasts).

## Komponenter
- Knappar: `.btn`, `.btn--primary`, `.btn--ghost`, `.btn--danger`, `.btn--sm`, `.btn--block`, `.icon-btn`
- Kort: `.card`, `.card__header`, `.card__body`, `.card__footer`
- Formulär: `.field`, `.field__label`, `.field__hint`, `.field__error`, `.input`, `.select`, `.textarea`, `.segmented`, `.segmented__option`, `.segmented__option--active`
- Betyg: `.stars` (tomt element med `role="img"` + `aria-label`, `--value` 0-5 ger fyllnad i halvsteg), `.stars--lg`, `.stars-input` (storlek via `font-size`, 1 stjärna = 1em; knappar `.stars-input__btn` med `--fill` 0/0.5/1 per knapp, alternativt `.stars-input__btn--active` för hel), `.rating-badge` (siffra i färgad bricka; `--good`/`--mid`/`--bad` modifierare), `.subrating` (rad med etikett + mätare: `.subrating__label`, `.subrating__bar`, `.subrating__fill` med `--value` 0-5)
- IATA-kod: `.iata-tag` (split-flap: en mörk bricka per tecken, förutsätter 3 tecken; annat antal via `--chars`), `.iata-tag--lg` (med flip-animation vid visning). `.airport-hero__code` får samma utseende automatiskt.
- Check-in i flöde: `.checkin`, `.checkin__head`, `.checkin__avatar`, `.checkin__meta`, `.checkin__body`, `.checkin__comment`, `.checkin__actions`, `.kind-chip` (+ `--departure`, `--arrival`, `--transfer`, `--layover`)
- Like-knapp: `.like-btn`, `.like-btn--active`
- Flygplats: `.airport-hero`, `.airport-hero__code`, `.airport-hero__name`, `.airport-hero__place`, `.stat`, `.stat__value`, `.stat__label`
- Listor/topplistor: `.list`, `.list__item`, `.rank`, `.rank--1`, `.rank--2`, `.rank--3`
- Sök: `.searchbar`, `.searchbar__input`, `.autocomplete`, `.autocomplete__item`, `.autocomplete__item--active`, `.search-hit`, `.search-hit mark`
- Övrigt: `.avatar` (initialer i cirkel, `--hue` CSS-variabel 0-360; `.avatar--sm`, `.avatar--lg`), `.badge` (`.badge--signal`), `.empty-state`, `.empty-state__icon`, `.spinner` (`.spinner--sm`), `.toast`, `.toast--error`, `.tabs`, `.tab`, `.tab--active`, `.muted`, `.visually-hidden`

## Utforska (v1.1)
- Filter: `.filters` (panel; `.filters--sidebar` blir sticky på desktop), `.filters__group` (gärna `<fieldset>` med `<legend>`, eller `.filters__label`), `.chip`, `.chip--active` (även `aria-pressed="true"`), `.chip__count`, `.sortbar` (antal till vänster, `.select` till höger)
- Resultatrad: `.result-row` (gärna `<a>` i en `.list`) med `.result-row__code` (innehåller `.iata-tag`), `.result-row__main` (namn), `.result-row__meta` (ort, land, antal), `.result-row__score` (`.rating-badge` + antal betyg)
- Kort: `.tile`, `.tile__title`, `.tile__meta`, `.tile__code` (landskod uppe till höger), `.tile--continent` (ljus kontinentfärg med gradnät och streckad flygrutt; sätt `data-continent="EU|NA|SA|AS|AF|OC|AN"`)
- Horisontell rad: `.carousel` > `.carousel__item` (scroll-snap, 78 % bredd på mobil, 260 px på desktop)
- Märken: `.badge-grid` > `.badge-card` (`.badge-card--locked`), `.badge-card__icon` (img), `.badge-card__name`, `.badge-card__desc`, `.badge-card__date`, `.badge-card__progress` (sätt `--progress` 0-1)
- Önskelista: `.wish-btn`, `.wish-btn--active` (eller `aria-pressed="true"`; fyller IconBookmark)
- Modal: `.modal` > `.modal__backdrop` + `.modal__panel` (bottom sheet på mobil, centrerad från 640 px). Tillagt: `.modal__header`, `.modal__title`, `.modal__footer`
- Nytt märke: `.badge-unlock` > `.badge-unlock__icon` (img, strålar + studs en gång), `.badge-unlock__title`, `.badge-unlock__name`, `.badge-unlock__desc`. Läggs i `.modal__panel`.

## Foton och resedetaljer
- Fotoväljare: `.photo-picker` (rutnät) > `.photo-picker__tile` (img + `.photo-picker__remove`-knapp) och `.photo-picker__add` (gärna `<label>` med dold `<input type="file">` inuti)
- `.photo-strip` - rad med tumnaglar (72 px), barn är `<button><img></button>` eller `<img>`
- `.gallery` - 2/3/4 kolumner, kvadratiska bilder; barn `<button><img>` med valfri `.gallery__caption`
- `.lightbox` (fast helskärm) med `<img>`, `.lightbox__caption`, `.lightbox__close`, `.lightbox__prev`, `.lightbox__next`
- `.class-chip` + `--economy`, `--premium_economy`, `--business`, `--first`
- `.airline-tag` > `.airline-tag__code` (t.ex. SK) + `.airline-tag__name`
- `.detail-list` - `<dl>` med `<div><dt>Etikett</dt><dd>Värde</dd></div>` per fält (boardingkortsfält); `.detail-list__mono` på `<dd>` för koder
- `.match-hint` - liten etikett ("Stad", "Land") längst till höger i `.autocomplete__item`

## Karta
- `.map` (behållare, relativ) > `.map__svg` (inline `<svg>`)
- `.map__country` - landets `<path>`; fyllnad via `data-step="0..6"` (se stegindelning ovan) eller egen `--fill`. Hover/fokus och `.map__country--active` ger kontur.
- `.map__dot`, `.map__dot--visited` - flygplatsprickar (`<circle>`)
- `.map__legend` med `.map__legend-scale` (6 tomma `<span>`, färgas automatiskt), `.map__legend-item` + `.map__swatch` (`--dot`, `--dot-visited`)
- `.map__tooltip` - absolut positionerad; sätt `left`/`top` till punkten, den lägger sig ovanför. `<strong>` för rubrik.
- `.coverage-bar` - mätare, `--value` 0-100
- `.map-toggle` - växel karta/lista, barn `<button aria-pressed>` (eller `.map-toggle__option` + `--active`)

## Assets
- `client/src/assets/logo.svg` (split-flap-bricka med G + ordmärke "Gatelog" i konturer; byter ordmärkesfärg via `prefers-color-scheme` i SVG:n), `client/public/favicon.svg`
- PWA: `client/public/manifest.webmanifest`, `icon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`, `apple-touch-icon.png`. Temafärg `#F3F7FB` (bör även stå i `<meta name="theme-color">` i `index.html`).
- Märken: `client/src/assets/badges/<id>.svg` för varje märkes-id i API:t (`first-checkin`, `airports-10/25/50/100`, `countries-5/15/30`, `all-continents`, `nordic`, `transfer-king`, `lounge-expert`, `home-turf`, `reviewer`). Emaljnål med metallring (brons/silver/guld efter nivå).
- Stilguide: `client/src/styles/styleguide.html` (öppna direkt i webbläsaren).
- Ikoner som React-komponenter i `client/src/assets/icons.jsx`: `export function IconPlane, IconHome, IconSearch, IconTrophy, IconUser, IconStar, IconHeart, IconLounge, IconMapPin, IconPlus, IconLogout, IconTransfer, IconDeparture, IconArrival, IconClock, IconGlobe, IconFilter, IconBookmark, IconBadge, IconShield, IconWifi, IconFood, IconSparkle, IconCamera, IconSeat, IconTicket, IconImage, IconClose` - alla tar `{size=20, ...props}`, `stroke="currentColor"`.
