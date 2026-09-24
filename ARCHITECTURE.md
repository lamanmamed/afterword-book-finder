# Afterword architecture

## Current version

The current site is intentionally static and privacy-light:

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

The `supabase/` and `scripts/` directories add an optional production-style catalogue.

Supabase stores:
- Open Library work key;
- title and author;
- cover ID;
- publication year;
- subjects;
- Open Library popularity/rating metadata;
- the exact metadata text embedded by the model;
- a 384-dimensional transformer embedding.

The `match_books` SQL function performs cosine similarity search through pgvector.

### Why keep Open Library for search?

Live Open Library search gives the user a broad catalogue without requiring Afterword to mirror the entire bibliographic database.

### Why add a local vector catalogue?

A local vector catalogue makes recommendation retrieval faster, reproducible and easier to evaluate. It also prevents recommendation generation from depending on a fresh set of Open Library search results each time.

## Covers and attribution

Afterword references cover images through Open Library's Covers API rather than copying cover files into this repository. Book-cover copyrights may belong to publishers, artists or other rights holders; the project does not claim ownership of those images.

## Next evaluation step

Once the persistent catalogue is populated, evaluate the recommender on:
- semantic relevance;
- intra-list diversity;
- author repetition;
- catalogue coverage;
- novelty/popularity trade-offs.

This allows the product question to become measurable: **how much relevance should Afterword trade for discovery?**