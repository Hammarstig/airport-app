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
| `--map-1` ... `--map-6` | #F6C744 #F29B38 #E06A3B #BF4250 #8E2E63 #55205F | #4C7FD0 #3FA5C6 #3EBF9F #8AD46A #E2D74C #FFF2A8 | Choropleth 0-100 %, sekventiell med monoton ljushet (färgblindvänlig). Steg 1 skiljer sig i kulör från obesökt. |
| `--map-none` / `--map-border` / `--map-visited-stroke` | #E4EAF0 / #FFFFFF / mörk kontur | #1C2D45 / #0B1525 / ljus kontur | Obesökt land, gränser, kontur runt besökta länder (ger 3:1 mot omgivningen) |
| `--tier-bronze` `--tier-silver` `--tier-gold` `--tier-platinum` | #B86A2E #8E9BAA #D99A0B #7D8FB0 (+ `-hi`) | samma | Märkesnivåer |
| `--board-ring` | transparent | vit 22 % | Kontur runt split-flap i mörkt tema |
| `--dot-visited` / `--dot-unvisited` | #FFBE2E / #FFFFFF (+ `-stroke`) | #FFC22E / #0F1B2C | Flygplatsprickar |

Stegindelning för kartan: 0 % = `data-step="0"`, 1-16 = 1, 17-33 = 2, 34-50 = 3, 51-66 = 4, 67-83 = 5, 84-100 = 6.

### Typsnitt (självhostade, `client/public/fonts/`, deklarerade i `client/src/styles/fonts.css`)
Woff2 från @fontsource (SIL OFL 1.1, licenser i samma mapp), subset latin + latin-ext via `unicode-range`, `font-display: swap`. Inga externa anrop, fungerar med CSP `font-src 'self'`.
- **Big Shoulders Display** 700/800 - rubriker, sidtitlar, siffror i stat/rating-badge (kondenserad flygplatsskylt). Fallback Arial Narrow.
- **Atkinson Hyperlegible** 400/400 kursiv/700 - brödtext och UI. Fallback system-ui.
- **IBM Plex Mono** 600 - endast koder: IATA, flightnummer, gate, plats. Fallback ui-monospace.

Förladda de två viktigaste i `client/index.html` (Bygg):
```html
<link rel="preload" href="/fonts/atkinson-hyperlegible-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/big-shoulders-display-latin-800-normal.woff2" as="font" type="font/woff2" crossorigin>
```
Typskala 1.25: 0.8 / 0.875 / 1 / 1.25 / 1.563 / 1.953 / 2.441 / 3.052 rem.

### Touch
Alla interaktiva kontroller har minst 48x48 px träffyta (Android). Visuellt mindre kontroller (`.btn--sm`, `.chip`, `.like-btn`, `.segmented__option`, `.wish-btn`) får en osynlig utökad träffyta via `::after`. Bottom-nav och toast tar hänsyn till `env(safe-area-inset-bottom)`; `index.html` bör ha `viewport-fit=cover`.

## Layout
`.app-shell`, `.topbar`, `.topbar__brand`, `.topbar__nav`, `.topbar__link`, `.topbar__link--active`, `.bottom-nav` (mobil), `.bottom-nav__item`, `.bottom-nav__item--active`, `.page`, `.page__header`, `.page__title`, `.page__subtitle`, `.section`, `.section__title`, `.grid`, `.grid--2`, `.grid--3`, `.stack` (vertikal gap), `.row` (horisontell flex, gap, wrap), `.spacer`
Tillagt: `.stack--sm`, `.stack--lg`, `.row--between`, `.row--nowrap`, `.skip-link` (tillsammans med `.visually-hidden`, syns vid fokus), `.toast-region` (fast behållare för toasts).
- `.stat-row` > `.stat` - statistik alltid på en rad (3 eller 4 kolumner även på 360 px), streckade avdelare som fält på ett boardingkort. `.stat-row--plain` utan ram. Stjärnor kan ligga inline i `.stat__value`. En `.grid` som innehåller `.stat` får samma utseende automatiskt.
- `.layout-split` > (huvudinnehåll) + `.layout-split__aside` - från 1024 px flöde + sticky sidopanel på 320 px (egen statistik, märkesprogress, notiser). Sidopanelen döljs under 1024 px.
- Topbar: `.topbar__back` (ikonknapp, använd `IconChevronLeft`), `.topbar__search` (syns från 768 px), `.topbar__actions` (notiser, inställningar; till höger).
- Status: `.offline-banner` (`--offline`), `.offline-queue`, `.skeleton` (shimmer ovanpå platshållare), `.coverage-table`.
- Hjälpklasser: `.text-xs`, `.text-sm`, `.text-lg`, `.text-right`, `.text-center`, `.bold`, `.nowrap`, `.truncate`, `.tabular`, `.flex-1`, `.min-w-0`, `.mt-0`, `.mt-2`, `.mt-4`, `.gap-1`, `.gap-2`, `.items-center`, `.justify-center`. Använd dem i stället för inline-stilar.
- Länkar i `.list`, `.result-row`, `.search-hit`, `.coverage-table`, `.podium`, `.comment` och `.tile` är inte understrukna (understrykning vid hover/fokus).
- `.tabs` har fade-kant till höger och scroll-snap; scrolla aktiv flik in i vy med `scrollIntoView({inline: 'nearest'})`.

## Komponenter
- Knappar: `.btn`, `.btn--primary`, `.btn--ghost`, `.btn--danger`, `.btn--sm`, `.btn--block`, `.icon-btn`
- Kort: `.card`, `.card__header`, `.card__body`, `.card__footer`
- Formulär: `.field`, `.field__label`, `.field__hint`, `.field__error`, `.input`, `.select`, `.textarea`, `.segmented`, `.segmented__option`, `.segmented__option--active`
- Betyg: `.stars` (tomt element med `role="img"` + `aria-label`, `--value` 0-5 ger fyllnad i halvsteg), `.stars--lg`, `.stars-input` (storlek via `font-size`, 1 stjärna = 1em; knappar `.stars-input__btn` med `--fill` 0/0.5/1 per knapp, alternativt `.stars-input__btn--active` för hel), `.rating-badge` (siffra i färgad bricka; `--good`/`--mid`/`--bad` modifierare), `.subrating` (rad med etikett + mätare: `.subrating__label`, `.subrating__bar`, `.subrating__fill` med `--value` 0-5)
- IATA-kod: `.iata-tag` (split-flap: en mörk bricka per tecken, förutsätter 3 tecken; annat antal via `--chars`), `.iata-tag--lg` (med flip-animation vid visning). `.airport-hero__code` får samma utseende automatiskt.
- Check-in i flöde (kompakt boardingkort, 2-3 per skärm på Pixel 7): `.checkin`, `.checkin__head` (avatar 36 px, namn + flygplats på en rad, datum + ort på en rad, IATA till höger), `.checkin__avatar`, `.checkin__meta`, `.checkin__body`, `.checkin__comment` (max 4 rader; `.checkin__comment--full` visar allt), `.checkin__actions` (perforering med hack, ingen egen sidfot; skål, kommentar, dela), `.kind-chip` (+ `--departure`, `--arrival`, `--transfer`, `--layover`).
  - Delbetyg: en `ul.row` med `.badge` i `.checkin__body` visas som tunn textrad; de tre första syns, resten blir "+N" (läses ändå upp). Alternativt `.checkin__ratings`.
  - Foto: `.photo-strip` i kortet visar första fotot stort (16:9, max 240 px) och resten som tumnaglar. Alternativt `.checkin__photo` (knapp med en `img`).
  - Resedetaljer: `.detail-list` inuti `.checkin` blir automatiskt en rad "KL1150 · KLM · Business" (dt döljs visuellt men läses upp). Alternativt `.checkin__details` med spans.
- Like/åtgärder: `.like-btn`, `.like-btn--active`, `.action-btn` (kommentar, dela; samma form som like)
- Flygplats: `.airport-hero`, `.airport-hero__code`, `.airport-hero__name`, `.airport-hero__place`, `.stat`, `.stat__value`, `.stat__label`
- Listor/topplistor: `.list`, `.list__item`, `.rank` (siffra i bricka, ingen gångjärnslinje), `.rank--1`, `.rank--2`, `.rank--3`, `.rank-delta` (`--up`, `--down`, `--same`, `--new`; texten är antal placeringar), `.list__item--me` (egen rad), `.list__item--pinned` (nålas fast i botten ovanför bottom-nav)
- Sök: `.searchbar`, `.searchbar__input`, `.autocomplete`, `.autocomplete__item`, `.autocomplete__item--active`, `.search-hit`, `.search-hit mark`
- Övrigt: `.avatar` (initialer i cirkel, `--hue` CSS-variabel 0-360, fast ljushet 31 % så vit text alltid klarar 4,5:1; `.avatar--sm`, `.avatar--lg`; storlek via `--avatar-size`), `.badge` (`.badge--signal`), `.empty-state`, `.empty-state__icon`, `.spinner` (`.spinner--sm`), `.toast`, `.toast--error`, `.tabs`, `.tab`, `.tab--active`, `.muted`, `.visually-hidden`

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
- `.map__country` - landets `<path>`; fyllnad via `data-step="0..6"` (se stegindelning ovan) eller egen `--fill`. Besökta länder (steg 1-6 eller `.map__country--visited`) får kontur `--map-visited-stroke`. Hover/fokus och `.map__country--active` ger tjockare kontur.
- `.map__dot`, `.map__dot--visited` - flygplatsprickar (`<circle>`)
- `.map__legend` med `.map__legend-scale` (6 tomma `<span>`, färgas automatiskt), `.map__legend-item` + `.map__swatch` (`--dot`, `--dot-visited`)
- `.map__tooltip` - absolut positionerad; sätt `left`/`top` till punkten, den lägger sig ovanför. `<strong>` för rubrik.
- `.coverage-bar` - mätare, `--value` 0-100
- `.map-toggle` - växel karta/lista, barn `<button aria-pressed>` (eller `.map-toggle__option` + `--active`)

## Gamification (`gamification.css`)
- Märkesnivåer: `.badge-card--bronze|--silver|--gold|--platinum` (ram, toppkant och ton), `.tier-chip` + `.tier--bronze|silver|gold|platinum` ("Nivå 7"). Om API:t ger nivå 1-10: 1-2 brons, 3-5 silver, 6-8 guld, 9-10 platina.
- `.podium` > tre `.podium__place` (`--1`, `--2`, `--3`; visas 2-1-3, `--me` för egen plats) med `.podium__avatar` (innehåller `.avatar`), `.podium__name`, `.podium__value` (`<strong>` för siffran), `.podium__block` (pallsteget med placeringssiffran). Plats 4+ i en vanlig `.list` under.
- `.level-bar` (sätt `--value` 0-100 = andel mot nästa nivå) > `.level-bar__level` (split-flap-bricka, `<span><small>NIVÅ</small>12</span>`), `.level-bar__title`, `.level-bar__track` (fyllnaden ritas automatiskt, eller lägg `.level-bar__fill` i den), `.level-bar__meta` (två spans: XP och kvar till nästa). `.level-bar--compact` för sidopanel och kvitto. `.xp-chip` ("+40 XP") i flödet.
- `.streak` > `IconFlame` + `.streak__count` + `.streak__unit`. `.streak--active` (flamman fladdrar diskret), `.streak--cold` (bruten), `.streak--lg`.
- `.share-card` (4:5 = 1080x1350, skalar med sin bredd via container-enheter) > `.share-card__inner` med `.share-card__brand`, `.share-card__title`, `.share-card__hero` (stor siffra), `.share-card__label`, `.share-card__stats` > `.share-card__stat` (`<b>` + `<span>`), `.share-card__codes` (iata-tags); plus `.share-card__footer` (gul stub med `.share-card__barcode`) som syskon till `__inner`. `.share-card--dark` för mörk variant. Rendera i 1080 px bredd för bildexport.
- `.checkin-done` (sammanfattning efter check-in) > `.checkin-done__stamp` (passtämpel: `.checkin-done__stamp-kind`, `.checkin-done__stamp-code`, `.checkin-done__stamp-date`), `.checkin-done__title`, `.checkin-done__subtitle`, `.checkin-done__xp`, `.checkin-done__panel` (level-bar, streak, `.checkin-done__next`), `.checkin-done__badges` > `.checkin-done__badge` (img + namn), `.checkin-done__actions` (Dela, Klar). Stämpeln landar, sedan glider resten in i tur och ordning och XP-mätaren fylls. Allt stängs av vid `prefers-reduced-motion`.

## Socialt (`social.css`)
- `.notif-dot` i en `.icon-btn` (prick när tom, räknare med text, `--pulse` pulserar två gånger). Notislista: `.list__item.notif-item` (`--unread`) med `.notif-item__text` och `.notif-item__time`.
- `.comment-thread` (ul) > `.comment` (li: `.avatar` + `.comment__body` med `.comment__meta`, `.comment__text`, `.comment__actions`); `.comment--reply` indrag, `.comment--mine`, `.comment-thread__more` ("Visa alla 8"). `.comment-form` (input + `.icon-btn` skicka). Inuti `.checkin` får tråden en ljus platta.
- `.follow-btn` ("Följ", fylld), `.follow-btn--active` eller `aria-pressed="true"` ("Följer", kontur, blir röd vid hover = avfölj), `.follow-btn--sm`.
- `.user-row` > `.avatar` + `.user-row__main` (`.user-row__name`, `.user-row__meta`) + valfri `.follow-btn`.

## Assets
- `client/src/assets/logo.svg` (split-flap-bricka med G + ordmärke "Gatelog" i konturer; byter ordmärkesfärg via `prefers-color-scheme` i SVG:n), `client/public/favicon.svg`
- PWA: `client/public/manifest.webmanifest`, `icon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`, `apple-touch-icon.png`. Temafärg `#F3F7FB` (bör även stå i `<meta name="theme-color">` i `index.html`).
- Märken: `client/src/assets/badges/<id>.svg` för varje märkes-id i API:t (`first-checkin`, `airports-10/25/50/100`, `countries-5/15/30`, `all-continents`, `nordic`, `transfer-king`, `lounge-expert`, `home-turf`, `reviewer`). Emaljnål med metallring; standardnivå: brons för första steget, silver, guld, platina för `airports-100` och `all-continents`. Antal prickar under emaljen och tänder på ringen ökar med nivån, platina har iriserande ring och gnista.
- Märken per nivå: `client/src/assets/badges/tiers/<id>--<bronze|silver|gold|platinum>.svg` (alla 14 märken i alla fyra nivåer).
- Stilguide: `docs/styleguide.html`. Servera repots rot statiskt med `/fonts/` pekande på `client/public/fonts` för rätt typsnitt; direkt från disk används systemtypsnitt.
- Ikoner som React-komponenter i `client/src/assets/icons.jsx`: `export function IconPlane, IconHome, IconSearch, IconTrophy, IconUser, IconStar, IconHeart, IconLounge, IconMapPin, IconPlus, IconLogout, IconTransfer, IconDeparture, IconArrival, IconClock, IconGlobe, IconFilter, IconBookmark, IconBadge, IconShield, IconWifi, IconFood, IconSparkle, IconCamera, IconSeat, IconTicket, IconImage, IconClose, IconBell, IconComment, IconShare, IconFlame, IconUsers, IconSettings, IconNearby, IconMap, IconChevronLeft, IconCheck` - alla tar `{size=20, ...props}`, `stroke="currentColor"`.
