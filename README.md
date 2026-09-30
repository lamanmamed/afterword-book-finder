# Afterword book finder

Afterword is a personal recommendation project that currently turns a reader's favourite books into recommendations based on semantic similarity, subject overlap and discovery-oriented reranking. The next expansion adds films while keeping the same taste-based recommendation idea.

The project is not currently publicly hosted. If you want to try it, run it locally using the steps below.

## What it does

1. Search for books by title or author through Open Library.
2. Select at least two books you enjoyed.
3. Convert the selected books' metadata into 384-dimensional embeddings with **gte-small**.
4. Combine those embeddings into a reader taste vector.
5. Query a Supabase pgvector catalogue for nearby books.
6. Rerank the results into:
   - **Closest to your shelf**: strongest overall matches
   - **Something different**: relevant books with more thematic distance
   - **Hidden gems**: good matches with a lighter popularity signal
7. Explain recommendations using the selected books and shared themes.
8. Open any recommended book to fetch its synopsis from Open Library.

## Movies foundation

The movie catalogue is intentionally additive so the working book recommender does not need to be rewritten before the film experience is ready.

- `supabase/movies.sql` creates a public-read movie catalogue, an HNSW vector index, `match_movies`, and `search_movies`.
- `scripts/seed_movies.py` pulls a broad movie set from TMDB, builds metadata text, embeds it with the same 384-dimensional `gte-small` model, and upserts it into Supabase.
- The TMDB access token is only used by the server-side seeding script and should never be exposed in browser JavaScript.
- A later UI step can search the local movie catalogue through Supabase and create a movie taste vector using the same embedding space as the catalogue.

To initialise the movie catalogue, first run `supabase/movies.sql` in the Supabase SQL Editor, then:

```bash
pip install -r scripts/requirements.txt
python scripts/seed_movies.py --pages-per-genre 3
```

Set `TMDB_READ_ACCESS_TOKEN` in your local `.env` before running the seeder.

## Why I built it

I wanted to explore a recommendation problem that felt personal to me: how do you recommend stories that are recognisably suited to someone's taste without returning the same kind of thing over and over again?

The project focuses on the trade-off between **familiarity and discovery**. The next evaluation step is to measure that trade-off using relevance, intra-list diversity, novelty and catalogue coverage.

## How the book recommender works

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

The browser does not store personal reading history. Supabase stores catalogue metadata and embeddings only.

## A couple of implementation snippets

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

### 1. Clone the repository

```bash
git clone https://github.com/lamanmamed/afterword-book-finder.git
cd afterword-book-finder
```

If you already cloned it before, update your local copy instead:

```bash
git pull
```

### 2. Start a local web server

The site uses ES module imports, so do not open `dist/index.html` directly.

On Windows:

```bash
python -m http.server 8000 --directory dist
```

On macOS or Linux:

```bash
python3 -m http.server 8000 --directory dist
```

### 3. Open the site

Go to:

```text
http://localhost:8000
```

The transformer model is downloaded the first time you request recommendations and then cached by the browser, so the first run can take longer.

## Persistent catalogue

The project uses **Supabase + pgvector** for persistent recommendation retrieval.

- `supabase/schema.sql` creates the book table, vector index and similarity function.
- `scripts/seed_catalog.py` pulls metadata from Open Library and creates book embeddings.
- `supabase/movies.sql` creates the movie table and movie search/retrieval functions.
- `scripts/seed_movies.py` pulls movie metadata from TMDB and creates movie embeddings.
- `.env.example` documents the environment variables needed for catalogue seeding.

To build your own book catalogue:

```bash
pip install -r scripts/requirements.txt
python scripts/seed_catalog.py --limit-per-query 250
```

Never expose the Supabase service-role key or TMDB read access token in browser code.

## Metadata and artwork

Book search, metadata, synopses and cover references come from **Open Library**.

Movie catalogue metadata comes from **TMDB**. Poster paths are stored as references rather than copied into this repository.

For book covers, Afterword prefers an edition or ISBN-specific image instead of relying only on a work-level cover ID. This reduces mismatched historical scans and gives more consistent results.

## Stack

**JavaScript · Transformers.js · gte-small · Open Library API · TMDB API · Python · Sentence Transformers · PostgreSQL · Supabase · pgvector**
