/**
 * JSDoc-typer för API-objekten (docs/API.md). Används för dokumentation och redigerarstöd;
 * importera med `@typedef {import('../lib/types.js').Checkin} Checkin`.
 *
 * @typedef {{ username: string, displayName: string, homeIata: string | null, level?: number }} UserSummary
 * @typedef {{ iata: string, icao?: string | null, name: string, city: string, country: string, continent: string,
 *   lat?: number, lon?: number, type: 'large' | 'medium' | 'small', region?: string | null, regionName?: string | null,
 *   countryName?: string, matchedOn?: 'iata' | 'icao' | 'city' | 'name' | 'country' }} AirportSummary
 * @typedef {{ security: number | null, cleanliness: number | null, food: number | null, wifi: number | null,
 *   transfer: number | null, lounges: number | null }} Ratings
 * @typedef {{ id: number, url: string, width?: number | null, height?: number | null, createdAt: string }} Photo
 * @typedef {'departure' | 'arrival' | 'transfer' | 'layover'} Kind
 * @typedef {'economy' | 'premium_economy' | 'business' | 'first'} TravelClass
 * @typedef {'public' | 'friends' | 'private'} Visibility
 * @typedef {{ id: number, user: UserSummary, airport: AirportSummary, visitedOn: string, kind: Kind,
 *   rating: number | null, ratings: Ratings, comment: string | null, likes: number, likedByMe: boolean,
 *   commentCount: number, createdAt: string, editedAt: string | null, airline: { iata: string, name: string } | null,
 *   travelClass: TravelClass | null, lounge: { id: number, name: string, terminal: string | null } | null,
 *   flightNumber: string | null, photos: Photo[], visibility?: Visibility, publishAt?: string }} Checkin
 * @typedef {{ level: number, title: string, xp: number, levelXp: number, nextLevelXp: number }} Level
 * @typedef {{ current: number, longest: number, thisWeek: boolean }} Streak
 * @typedef {'bronze' | 'silver' | 'gold' | 'platinum'} Tier
 * @typedef {{ id: string, name: string, description: string, category: string, tier: Tier | null, tierLevel: number,
 *   earnedAt: string | null, tiers: { tier: Tier, target: number, earnedAt: string | null }[],
 *   progress: { current: number, target: number }, rarity: number }} Badge
 * @typedef {{ id: number, type: string, actor: UserSummary | null, checkinId: number | null,
 *   airport: { iata: string, name: string } | null, badge: { id: string, name: string, tier: Tier } | null,
 *   badges?: { id: string, name: string, tier: Tier }[], text: string, read: boolean, createdAt: string,
 *   groupKey?: string, url?: string }} Notification
 * @typedef {{ rank: number, user: UserSummary, value: number, change: number | null }} RankingRow
 * @typedef {{ metric: string, period: string, from: string | null, to: string | null, items: RankingRow[],
 *   me: { rank: number, value: number, change: number | null } | null, around: RankingRow[] }} Ranking
 */
export {};
