# Gatelog - designkontrakt

Grafik-agenten implementerar dessa klasser i `client/src/styles/` (entry: `client/src/styles/index.css`, som bygg-agenten importerar i `main.jsx`). Bygg-agenten använder bara dessa klassnamn (plus egna layout-utilities via inline style vid behov). Grafik-agenten får lägga till klasser men inte döpa om dessa.

## Tema
Ljust och mörkt tema via `prefers-color-scheme` + `[data-theme]` på `<html>`. Mobil först (360 px), max innehållsbredd 1100 px.

## Layout
`.app-shell`, `.topbar`, `.topbar__brand`, `.topbar__nav`, `.topbar__link`, `.topbar__link--active`, `.bottom-nav` (mobil), `.bottom-nav__item`, `.bottom-nav__item--active`, `.page`, `.page__header`, `.page__title`, `.page__subtitle`, `.section`, `.section__title`, `.grid`, `.grid--2`, `.grid--3`, `.stack` (vertikal gap), `.row` (horisontell flex, gap, wrap), `.spacer`

## Komponenter
- Knappar: `.btn`, `.btn--primary`, `.btn--ghost`, `.btn--danger`, `.btn--sm`, `.btn--block`, `.icon-btn`
- Kort: `.card`, `.card__header`, `.card__body`, `.card__footer`
- Formulär: `.field`, `.field__label`, `.field__hint`, `.field__error`, `.input`, `.select`, `.textarea`, `.segmented`, `.segmented__option`, `.segmented__option--active`
- Betyg: `.stars` (visning, använd `--value` 0-5 som CSS-variabel för fyllnad), `.stars--lg`, `.stars-input` (klickbara halvstjärnor, knappar `.stars-input__btn`), `.rating-badge` (siffra i färgad bricka; `--good`/`--mid`/`--bad` modifierare), `.subrating` (rad med etikett + mätare: `.subrating__label`, `.subrating__bar`, `.subrating__fill` med `--value` 0-5)
- IATA-kod: `.iata-tag` (monospace, stort, boarding pass-känsla), `.iata-tag--lg`
- Check-in i flöde: `.checkin`, `.checkin__head`, `.checkin__avatar`, `.checkin__meta`, `.checkin__body`, `.checkin__comment`, `.checkin__actions`, `.kind-chip` (+ `--departure`, `--arrival`, `--transfer`, `--layover`)
- Like-knapp: `.like-btn`, `.like-btn--active`
- Flygplats: `.airport-hero`, `.airport-hero__code`, `.airport-hero__name`, `.airport-hero__place`, `.stat`, `.stat__value`, `.stat__label`
- Listor/topplistor: `.list`, `.list__item`, `.rank`, `.rank--1`, `.rank--2`, `.rank--3`
- Sök: `.searchbar`, `.searchbar__input`, `.autocomplete`, `.autocomplete__item`, `.autocomplete__item--active`, `.search-hit`, `.search-hit mark`
- Övrigt: `.avatar` (initialer i cirkel, `--hue` CSS-variabel 0-360), `.badge`, `.empty-state`, `.empty-state__icon`, `.spinner`, `.toast`, `.toast--error`, `.tabs`, `.tab`, `.tab--active`, `.muted`, `.visually-hidden`

## Assets
- `client/src/assets/logo.svg` (märke + ordmärke "Gatelog"), `client/public/favicon.svg`
- Ikoner som React-komponenter i `client/src/assets/icons.jsx`: `export function IconPlane, IconHome, IconSearch, IconTrophy, IconUser, IconStar, IconHeart, IconLounge, IconMapPin, IconPlus, IconLogout, IconTransfer, IconDeparture, IconArrival, IconClock` - alla tar `{size=20, ...props}`, `stroke="currentColor"`.
