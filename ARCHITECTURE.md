# Afterword architecture

## Current version

The current public-facing site is intentionally static and privacy-light:

1. **Search** queries the Open Library Search API live.
2. The selected books' title, author, subjects and publication year are converted into text.
3. **Transformers.js** loads `gte-small` in the browser and creates normalized 384-dimensional embeddings.
4. The reader's mean taste vector is sent to Supabase.
5. pgvector retrieves the nearest books from the persistent catalogue using cosine similarity.
6. If the persistent catalogue is unavailable or too small for a useful result set, the site falls back to live Open Library candidate discovery and browser-side embedding.
7. A small reranking step separates results into:
   - closest semantic matches;
   - related but more exploratory books;
   - lower-popularity semantic matches.
8. Recommendation explanations are generated from the nearest selected book and shared subjects. They are not free-form LLM claims.

No account or personal reading history is stored by the current site.

## Persistent catalogue layer

The `supabase/` and `scripts/` directories provide the production-style catalogue layer.

The book catalogue stores:
- Open Library work key;
- title and author;
- cover ID;
- publication year;
- subjects;
- Open Library popularity/rating metadata;
- the exact metadata text embedded by the model;
- a 384-dimensional transformer embedding.

The `match_books` SQL function performs cosine similarity search through pgvector.

## Movie expansion

Movies are being added as an additive catalogue first, before the UI is refactored.

`supabase/movies.sql` adds:
- TMDB movie ID;
- title and original title;
- release year;
- genres and overview;
- poster path;
- TMDB popularity/vote metadata;
- the exact embedded metadata text;
- a 384-dimensional `gte-small` embedding.

`match_movies` mirrors the book cosine-similarity retrieval pattern. `search_movies` provides safe public catalogue search without putting the TMDB access token in the browser.

`scripts/seed_movies.py` uses the TMDB API only during catalogue ingestion. It samples across multiple genres, deduplicates TMDB IDs, embeds movie metadata with the same model as the current book system, and upserts the result into Supabase.

Keeping book and movie embeddings model-compatible gives us a clean path to a shared taste layer later, while avoiding a breaking migration of the working book experience right now.

## Why keep Open Library for book search?

Live Open Library search gives the user a broad catalogue without requiring Afterword to mirror the entire bibliographic database.

## Why keep local vector catalogues?

A local vector catalogue makes recommendation retrieval faster, reproducible and easier to evaluate. It also prevents recommendation generation from depending on a fresh external search result set each time.

For movies, the local catalogue additionally lets the browser search safely without exposing a TMDB read token.

## Artwork and attribution

Afterword references book cover images through Open Library's Covers API rather than copying cover files into this repository. Movie poster paths are retained as TMDB references rather than checked into the repository.

## Next product steps

1. Seed and validate the movie catalogue.
2. Add a Books / Films mode switch without changing the visual identity.
3. Build movie selection, persistent selection during search, and movie recommendation results.
4. Add explicit feedback signals such as save, not interested, already read/watched and rating.
5. Introduce a shared taste representation across books and films.
6. Add natural-language discovery on top of deterministic retrieval.
7. Evaluate relevance, diversity, novelty and catalogue coverage before adding music.

The core product question remains measurable: **how much relevance should Afterword trade for discovery?**
