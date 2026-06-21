/**
 * Favorite teams — stored entirely in localStorage, no server round-trip.
 * Powers the star toggle on match/standings rows, the "My Teams" filter on
 * the Matches tab, and the targeting list sent along with a push
 * subscription (so notifications only fire for teams you actually care
 * about).
 */

const KEY = 'matchday:favorites';

export function getFavorites() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isFavorite(name) {
  return getFavorites().includes(name);
}

/** Toggles a team, persists it, and notifies the rest of the app. Returns the new list. */
export function toggleFavorite(name) {
  const favorites = getFavorites();
  const i = favorites.indexOf(name);
  if (i === -1) favorites.push(name);
  else favorites.splice(i, 1);
  try {
    localStorage.setItem(KEY, JSON.stringify(favorites));
  } catch {
    /* localStorage unavailable — favorites just won't persist this session */
  }
  document.dispatchEvent(new CustomEvent('favorites:change', { detail: favorites }));
  return favorites;
}
