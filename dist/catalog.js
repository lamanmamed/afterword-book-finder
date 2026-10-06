// Public catalogue access. No admin credentials or background keep-alive requests.
const SUPABASE_URL = "https://gtpeifnmdmdahjgbcmlp.supabase.co";
const SUPABASE_KEY = "sb_publishable_PdY3KGIOQy9WO31OenorGA_ltO6DDl5";

export async function fetchJSON(url, options = {}, timeoutMs = 8000) {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const abort = () => timeout.abort();
  const callerSignal = options.signal;
  if (callerSignal?.aborted) timeout.abort();
  callerSignal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, { ...options, signal: timeout.signal });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abort);
  }
}

export function rpc(name, params, signal) {
  return fetchJSON(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal
  });
}

export function searchLocalMovies(movies, query = "", limit = 24) {
  const q = query.trim().toLowerCase();
  const rank = movie => movie.title.toLowerCase() === q ? 0
    : movie.title.toLowerCase().startsWith(q) ? 1 : 2;
  return movies.filter(movie => !q || [movie.title, movie.original_title || ""]
    .some(title => title.toLowerCase().includes(q)))
    .sort((a, b) => rank(a) - rank(b) || b.vote_count - a.vote_count)
    .slice(0, limit);
}

export function validMovies(rows) {
  return Array.isArray(rows) ? rows.filter(row => Number.isSafeInteger(row?.tmdb_id)
    && row.tmdb_id > 0 && typeof row.title === "string"
    && Array.isArray(row.genres) && row.genres.every(x => typeof x === "string")
    && typeof row.overview === "string") : [];
}
