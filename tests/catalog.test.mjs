import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJSON, rpc, searchLocalMovies, validMovies } from '../dist/catalog.js';

test('failed HTTP requests reject so callers can use their fallback', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  try { await assert.rejects(fetchJSON('https://example.test'), /503/); }
  finally { globalThis.fetch = original; }
});

test('hung requests are aborted within the timeout', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  try { await assert.rejects(fetchJSON('https://example.test', {}, 15), /aborted/); }
  finally { globalThis.fetch = original; }
});

test('caller cancellation propagates to the network request', async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  globalThis.fetch = (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('cancelled')));
  });
  try {
    const request = fetchJSON('https://example.test', { signal: controller.signal });
    controller.abort();
    await assert.rejects(request, /cancelled/);
  } finally { globalThis.fetch = original; }
});

test('RPC passes the public key and selection exclusions', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.match(url, /\/rest\/v1\/rpc\/match_movies$/);
    assert.match(options.headers.apikey, /^sb_publishable_/);
    assert.deepEqual(JSON.parse(options.body).excluded_ids, [42]);
    return { ok: true, json: async () => [] };
  };
  try { assert.deepEqual(await rpc('match_movies', { excluded_ids: [42] }), []); }
  finally { globalThis.fetch = original; }
});

test('saved film search handles original titles, ranking and limits', () => {
  const movies = [
    { tmdb_id: 1, title: 'Moonrise', original_title: '', vote_count: 100, genres: [], overview: '' },
    { tmdb_id: 2, title: 'Moon', original_title: '', vote_count: 5, genres: [], overview: '' },
    { tmdb_id: 3, title: 'Another title', original_title: 'Luna', vote_count: 10, genres: [], overview: '' }
  ];
  assert.deepEqual(searchLocalMovies(movies, ' MOON ', 1).map(x => x.tmdb_id), [2]);
  assert.deepEqual(searchLocalMovies(movies, 'luna').map(x => x.tmdb_id), [3]);
  assert.deepEqual(searchLocalMovies(movies, 'missing'), []);
  assert.equal(validMovies([...movies, null, { tmdb_id: 'bad' }]).length, 3);
});
