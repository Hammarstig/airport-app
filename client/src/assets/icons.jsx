// Gatelog - linjeikoner. 24x24, stroke=currentColor, 1.75 px linje, rundade ändar.
// Alla tar {size = 20, ...props}; skicka aria-hidden="true" när ikonen är dekor.

function Svg({ size = 20, children, strokeWidth = 1.75, ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconPlane(props) {
  return (
    <Svg {...props}>
      <path d="M10.2 13.8 4 12.3l-1.2-1.5 1.5-.6 6 .9 4.6-4.6c.9-.9 2.6-1.5 3.3-.8.7.7.1 2.4-.8 3.3l-4.6 4.6.9 6-.6 1.5-1.5-1.2-1.5-6.2" />
      <path d="M10.2 13.8 7.4 16.6l-2.6-.3-.9.9 2.8 1.3 1.3 2.8.9-.9-.3-2.6" />
    </Svg>
  );
}

export function IconHome(props) {
  return (
    <Svg {...props}>
      <path d="M3.5 10.5 12 3.8l8.5 6.7" />
      <path d="M5.5 9v10.5a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9" />
    </Svg>
  );
}

export function IconSearch(props) {
  return (
    <Svg {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.4 15.4 5.1 5.1" />
    </Svg>
  );
}

export function IconTrophy(props) {
  return (
    <Svg {...props}>
      <path d="M7.5 4h9v5.5a4.5 4.5 0 0 1-9 0V4Z" />
      <path d="M7.5 6H4.5v1.5a3 3 0 0 0 3 3M16.5 6h3v1.5a3 3 0 0 1-3 3" />
      <path d="M12 14v3.5M8.5 20.5h7M9.5 20.5l.6-3h3.8l.6 3" />
    </Svg>
  );
}

export function IconUser(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6" />
    </Svg>
  );
}

export function IconStar(props) {
  return (
    <Svg {...props}>
      <path d="m12 3.2 2.7 5.6 6.1.8-4.5 4.2 1.2 6.1L12 17l-5.5 2.9 1.2-6.1-4.5-4.2 6.1-.8L12 3.2Z" />
    </Svg>
  );
}

export function IconHeart(props) {
  return (
    <Svg {...props}>
      <path d="M12 20s-7.5-4.6-8.9-9.2C2.2 7.6 4.3 4.5 7.5 4.5c2 0 3.5 1.1 4.5 2.7 1-1.6 2.5-2.7 4.5-2.7 3.2 0 5.3 3.1 4.4 6.3C19.5 15.4 12 20 12 20Z" />
    </Svg>
  );
}

export function IconLounge(props) {
  return (
    <Svg {...props}>
      <path d="M6 11V8a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v3" />
      <path d="M3.5 11.5a1.5 1.5 0 0 1 3 0V14h11v-2.5a1.5 1.5 0 0 1 3 0V17a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-5.5Z" />
      <path d="M6 18v2M18 18v2" />
    </Svg>
  );
}

export function IconMapPin(props) {
  return (
    <Svg {...props}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </Svg>
  );
}

export function IconPlus(props) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconLogout(props) {
  return (
    <Svg {...props}>
      <path d="M14 4.5H6.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1H14" />
      <path d="M10.5 12h10M17 8.5l3.5 3.5-3.5 3.5" />
    </Svg>
  );
}

export function IconTransfer(props) {
  return (
    <Svg {...props}>
      <path d="M4 8h13.5M14 4.5 17.5 8 14 11.5" />
      <path d="M20 16H6.5M10 12.5 6.5 16l3.5 3.5" />
    </Svg>
  );
}

export function IconDeparture(props) {
  return (
    <Svg {...props}>
      <path d="M3 20.5h18" />
      <path d="m4.5 15.5 2.5-.6 3.4-4.4-4-3.2 1.6-.6 5.6 2 4.1-1.9c1-.5 2.4-.6 2.8.2.4.8-.4 1.8-1.4 2.3l-11 5.6-2.9.3-.7-1.7Z" />
    </Svg>
  );
}

export function IconArrival(props) {
  return (
    <Svg {...props}>
      <path d="M3 20.5h18" />
      <path d="m3.6 8.7.9-1.6 1.7 2.3 3.8.6-.8-5.6 1.6.2 3.3 5 4.5.8c1.1.2 2.3.9 2.1 1.8-.2.9-1.5 1.2-2.6 1l-12.1-2.3-2.4-2.2Z" />
    </Svg>
  );
}

export function IconClock(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  );
}

export function IconGlobe(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5s1.1-6.1 3.5-8.5Z" />
    </Svg>
  );
}

export function IconFilter(props) {
  return (
    <Svg {...props}>
      <path d="M4 6.5h16M7 12h10M10 17.5h4" />
    </Svg>
  );
}

export function IconBookmark(props) {
  return (
    <Svg {...props}>
      <path d="M6.5 4.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16l-5.5-4-5.5 4v-16Z" />
    </Svg>
  );
}

export function IconBadge(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="9.5" r="6" />
      <path d="m12 6.8 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3 1-2Z" />
      <path d="M8.5 14.5 7 21l5-2.5 5 2.5-1.5-6.5" />
    </Svg>
  );
}

export function IconShield(props) {
  return (
    <Svg {...props}>
      <path d="M12 3.2 19 6v5.5c0 4.4-3 7.9-7 9.3-4-1.4-7-4.9-7-9.3V6l7-2.8Z" />
      <path d="m8.8 12 2.2 2.2 4.2-4.4" />
    </Svg>
  );
}

export function IconWifi(props) {
  return (
    <Svg {...props}>
      <path d="M2.8 9a13 13 0 0 1 18.4 0M5.8 12.3a8.6 8.6 0 0 1 12.4 0M8.8 15.5a4.3 4.3 0 0 1 6.4 0" />
      <circle cx="12" cy="18.8" r=".9" fill="currentColor" />
    </Svg>
  );
}

export function IconFood(props) {
  return (
    <Svg {...props}>
      <path d="M6.5 3.5v7M4.5 3.5v5a2 2 0 0 0 4 0v-5M6.5 10.5v10" />
      <path d="M17.5 20.5v-17c-2.2 0-3.5 2.7-3.5 6.5v4h3.5" />
    </Svg>
  );
}

export function IconSparkle(props) {
  return (
    <Svg {...props}>
      <path d="M11 3.5c.6 4.3 2.2 5.9 6.5 6.5-4.3.6-5.9 2.2-6.5 6.5-.6-4.3-2.2-5.9-6.5-6.5 4.3-.6 5.9-2.2 6.5-6.5Z" />
      <path d="M18 15c.3 1.9 1 2.6 2.9 2.9-1.9.3-2.6 1-2.9 2.9-.3-1.9-1-2.6-2.9-2.9 1.9-.3 2.6-1 2.9-2.9Z" />
    </Svg>
  );
}

export function IconCamera(props) {
  return (
    <Svg {...props}>
      <path d="M3.5 8.5a1.5 1.5 0 0 1 1.5-1.5h2.5L9 4.5h6L16.5 7H19a1.5 1.5 0 0 1 1.5 1.5v9.5A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18V8.5Z" />
      <circle cx="12" cy="13" r="3.5" />
    </Svg>
  );
}

export function IconSeat(props) {
  return (
    <Svg {...props}>
      <path d="M7 3.5h3l1.5 9h6a1.5 1.5 0 0 1 1.5 1.5v1.5H9.5L7 3.5Z" />
      <path d="M9.5 15.5 9 20.5M17.5 15.5l.5 5M7.5 20.5h12" />
    </Svg>
  );
}

export function IconTicket(props) {
  return (
    <Svg {...props}>
      <path d="M3.5 7a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v2.5a2.5 2.5 0 0 0 0 5V17a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-2.5a2.5 2.5 0 0 0 0-5V7Z" />
      <path d="M15 6.5v1.5M15 11.2v1.6M15 16v1.5" />
    </Svg>
  );
}

export function IconImage(props) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <circle cx="9" cy="9.5" r="1.6" />
      <path d="m4 17.5 5-4.5 3.5 3 3-2.5 4.5 4" />
    </Svg>
  );
}

export function IconClose(props) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}
