# Afterword book finder

Afterword is a personal recommendation project built around a simple question: how do you recommend something that feels recognisably right for someone's taste without giving them more of exactly the same thing?

The current version focuses on books. You choose a few books you enjoyed, Afterword builds a semantic taste profile from them, retrieves similar books from a Supabase pgvector catalogue, and reranks the results to balance familiarity with discovery.

I'm also extending the same idea to films.

## What it does

1. Search for books by title or author through Open Library.
2. Select at least two books you enjoyed.
3. Convert the selected books' metadata into 384-dimensional embeddings with **gte-small**.
4. Combine those embeddings into a reader taste vector.
5. Query a Supabase pgvector catalogue for nearby books.
6. Rerank the results into:
   - **Closest to your shelf**
   - **Something different**
   - **Hidden gems**
7. Explain each recommendation using the books and themes that actually influenced it.

## How the recommender works

```text
Open Library search
        |
        v
Selected books
        |
        v
gte-small embeddings
        |
        v
Reader taste vector
        |
        v
Supabase + pgvector retrieval
        |
        v
Diversity and popularity reranking
        |
        v
Closest to your shelf / Something different / Hidden gems
```

The selected books are embedded with the same model used for the persistent catalogue:

```javascript
const output = await extractor(books.map(metadataText), {
  pooling: "mean",
  normalize: true
});
```

The combined taste vector is then sent to the pgvector similarity function:

```javascript
const { data } = await supabase.rpc("match_books", {
  query_embedding: tasteVector,
  match_count: 60,
  excluded_keys: chosen.map(book => book.key)
});
```

Recommendation text is grounded in actual shared subjects and the nearest selected book rather than being generated freely.

## Reliability

Catalogue requests time out after eight seconds. Books fall back to Open Library discovery when Supabase is unavailable. The interface loads independently of the transformer CDN; the model is requested when recommendations are needed.

Films can use saved public metadata from previous catalogue requests or a bundled snapshot. Fallback recommendations embed those films in the browser and exclude the selected titles. The interface labels the smaller collection. A first-time visitor cannot use this fallback until a snapshot has been generated.

## Films

The film catalogue follows the same basic approach as books.

Movie metadata comes from TMDB, is embedded with the same 384-dimensional `gte-small` model, and is stored in Supabase with pgvector. The repository includes a separate movie catalogue schema and seeding script so the book recommender can keep working while the film experience is added.

```bash
pip install -r scripts/requirements.txt
python scripts/seed_movies.py --pages-per-genre 3
```

The seeding script expects `TMDB_READ_ACCESS_TOKEN`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your local `.env`. It also writes `dist/data/movies.json`; commit that public metadata snapshot with the site after seeding.

The live movie schema is installed, but the catalogue is still empty. This branch remains a draft until the TMDB import and real film recommendation checks are complete.

## Repository structure

```text
.
├── dist/
│   ├── index.html
│   ├── app.js
│   └── path-cover.webp
├── scripts/
│   ├── seed_catalog.py
│   ├── seed_movies.py
│   └── requirements.txt
├── supabase/
│   ├── schema.sql
│   └── movies.sql
├── .env.example
├── ARCHITECTURE.md
└── README.md
```

## Run it locally

Clone the repository:

```bash
git clone https://github.com/lamanmamed/afterword-book-finder.git
cd afterword-book-finder
```

Start a local web server:

```bash
python -m http.server 8000 --directory dist
```

Then open:

```text
http://localhost:8000
```

The transformer model is downloaded the first time recommendations are requested and then cached by the browser.

## Persistent catalogue

The project uses **Supabase + pgvector** for recommendation retrieval.

- `supabase/schema.sql` defines the book catalogue and similarity search.
- `scripts/seed_catalog.py` collects book metadata from Open Library and creates embeddings.
- `supabase/movies.sql` defines the film catalogue and movie search/retrieval functions.
- `scripts/seed_movies.py` collects movie metadata from TMDB and creates embeddings.

To populate the book catalogue:

```bash
pip install -r scripts/requirements.txt
python scripts/seed_catalog.py --limit-per-query 250
```

Never expose the Supabase service-role key or TMDB access token in browser code.

## Metadata and artwork

Book metadata, synopses and cover references come from **Open Library**. Movie metadata comes from **TMDB**.

Artwork is referenced through the source APIs rather than copied into this repository.

## Stack

**JavaScript · Transformers.js · gte-small · Open Library API · TMDB API · Python · Sentence Transformers · PostgreSQL · Supabase · pgvector**

## GitHub Pages

The deployment workflow publishes `dist/` after changes reach `main`. In repository **Settings → Pages**, choose **GitHub Actions** as the source, then run **Deploy Afterword**. The workflow does not enable Pages by itself. No deployment secrets are needed.

## Checks

```bash
node --check dist/app.js
node --test tests/catalog.test.mjs
```
