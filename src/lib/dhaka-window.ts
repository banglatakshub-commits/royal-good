const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const HALF_DAY_MS = 12 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** App earning limits reset at noon, Bangladesh time (UTC+6). */
export function getDhakaNoonWindow(now = Date.now()) {
  const localNow = new Date(now + DHAKA_OFFSET_MS);
  const localMidnight = new Date(localNow);
  localMidnight.setUTCHours(0, 0, 0, 0);
  const beforeNoon = localNow.getTime() - localMidnight.getTime() < HALF_DAY_MS;
  const startsAt =
    localMidnight.getTime() - DHAKA_OFFSET_MS + (beforeNoon ? -HALF_DAY_MS : HALF_DAY_MS);
  return {
    since: new Date(startsAt),
    resetAt: new Date(startsAt + DAY_MS),
  };
}
