# Afterword — book finder

Afterword is a personal book-discovery project that turns a reader's favourite books into semantic recommendations.

The current public version combines **live Open Library search** with a **transformer-based recommender running in the browser**.

[View the site](https://afterword-book-finder.lemanmamedova10.chatgpt.site)

## What it does

1. Search for books by title or author across Open Library.
2. Select at least two books you enjoyed.
3. Convert each selected book's metadata into a semantic embedding with **gte-small**.
4. Discover candidate books from related subjects and authors.
5. Embed the candidates with the same model and rank them by cosine similarity to the reader's combined taste vector.
6. Rerank the results into:
   - **Popular with readers like you** — closest semantic matches;
   - **Something different** — relevant recommendations with more thematic distance;
   - **Hidden gems** — strong matches with a lighter popularity signal.
7. Explain each recommendation using the nearest selected book and shared subjects rather than free-form generated claims.
8. Open any recommendation to fetch its synopsis from the Open Library Work/Edition APIs.

## Why I built it

Most recommendation interfaces optimise for showing something plausibly relevant. I was more interested in the trade-off between **familiarity and discovery**: how can a system stay close enough to a reader's taste to be useful without returning the same kind of book repeatedly?

The next step is to evaluate that trade-off explicitly using relevance, intra-list diversity, novelty and catalogue coverage.

## Current architecture

```text
Open Library Search API
        │
        ├── live book search + metadata
        │
        ▼
Selected books
        │
        ▼
gte-small
(Transformers.js in browser)
        │
        ▼
384-d semantic embeddings
        │
        ▼
Candidate discovery
        │
        ▼
semantic similarity + diversity/popularity reranking
        │
        ▼
recommendation sections + grounded explanations
```

The current site does not require an account and does not persist personal reading history. The Supabase catalogue contains book metadata and embeddings only.

## Persistent catalogue

The repository also includes a **Supabase + pgvector** catalogue layer for the next version:

- `supabase/schema.sql` creates the book table, vector index and similarity-search function.
- `scripts/seed_catalog.py` pulls book metadata from Open Library and generates 384-dimensional embeddings with Sentence Transformers.
- `.env.example` documents the Supabase environment variables required for seeding.

The public site is now connected to this Supabase catalogue for vector retrieval. Open Library remains the broad discovery/search source, while Supabase stores a curated recommendation catalogue with persistent embeddings. If the catalogue cannot return enough candidates, the site falls back to live Open Library candidate discovery.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the design decisions.

## Repository structure

```text
.
├── dist/
│   ├── index.html
│   ├── app.js
│   └── path-cover.webp
├── scripts/
│   ├── seed_catalog.py
│   └── requirements.txt
├── supabase/
│   └── schema.sql
├── .env.example
├── .openai/
│   └── hosting.json
├── ARCHITECTURE.md
└── README.md
```

## Run the site locally

Because the recommender imports Transformers.js as an ES module, serve the site over HTTP rather than opening the HTML file directly:

```bash
python3 -m http.server 8000 --directory dist
```

Then open:

```text
http://localhost:8000
```

The transformer model is downloaded on first use and cached by the browser, so the first recommendation can take longer than later ones.

## Build the persistent catalogue

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env` and add the project URL and **service-role key**.
4. Install the seeding dependencies:

```bash
pip install -r scripts/requirements.txt
```

5. Seed a starter catalogue:

```bash
python scripts/seed_catalog.py --limit-per-query 250
```

Never expose the Supabase service-role key in client-side code.

## Book metadata and covers

Book search and metadata come from **Open Library**. For covers, Afterword prefers the best matching edition/ISBN instead of relying only on a work-level cover ID, then falls back when a cover is unavailable. Cover images are referenced through the Open Library Covers API rather than copied into this repository. Existing rights in individual cover artwork may still belong to their respective rights holders.

## Stack

**JavaScript · Transformers.js · gte-small · Open Library API · Python · Sentence Transformers · PostgreSQL · Supabase · pgvector**