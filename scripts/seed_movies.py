"""Seed a Supabase pgvector movie catalogue from TMDB.

Usage:
    pip install -r scripts/requirements.txt
    cp .env.example .env
    python scripts/seed_movies.py --pages-per-genre 3

Requires:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- TMDB_READ_ACCESS_TOKEN

The TMDB token is used only by this server-side script. Do not expose it in browser code.
"""

from __future__ import annotations

import argparse
import os
import time
from datetime import datetime
from typing import Iterable

import requests
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from supabase import create_client


TMDB_BASE_URL = "https://api.themoviedb.org/3"
MODEL_NAME = "Supabase/gte-small"

DEFAULT_GENRES = [
    "Drama",
    "Comedy",
    "Romance",
    "Thriller",
    "Science Fiction",
    "Fantasy",
    "Crime",
    "Mystery",
    "Animation",
    "Documentary",
]


def release_year(value: str | None) -> int | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").year
    except ValueError:
        return None


def clean_genres(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    cleaned: list[str] = []
    for value in values:
        item = " ".join(str(value).split()).strip()
        key = item.lower()
        if not item or key in seen:
            continue
        seen.add(key)
        cleaned.append(item)
    return cleaned


def tmdb_get(session: requests.Session, path: str, **params) -> dict:
    response = session.get(
        f"{TMDB_BASE_URL}{path}",
        params=params,
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def genre_map(session: requests.Session) -> dict[int, str]:
    data = tmdb_get(session, "/genre/movie/list", language="en")
    return {
        int(item["id"]): str(item["name"])
        for item in data.get("genres", [])
        if item.get("id") and item.get("name")
    }


def normalize(movie: dict, genres_by_id: dict[int, str]) -> dict | None:
    if not movie.get("id") or not movie.get("title"):
        return None

    genres = clean_genres(
        genres_by_id[genre_id]
        for genre_id in movie.get("genre_ids", [])
        if genre_id in genres_by_id
    )

    year = release_year(movie.get("release_date"))
    overview = " ".join(str(movie.get("overview") or "").split()).strip()

    metadata_text = ". ".join(
        part
        for part in [
            str(movie["title"]).strip(),
            ", ".join(genres),
            overview,
            f"released {year}" if year else "",
        ]
        if part
    )

    return {
        "tmdb_id": int(movie["id"]),
        "title": str(movie["title"]).strip(),
        "original_title": str(movie.get("original_title") or movie["title"]).strip(),
        "release_year": year,
        "genres": genres,
        "overview": overview,
        "poster_path": movie.get("poster_path"),
        "popularity": float(movie.get("popularity") or 0),
        "vote_average": float(movie.get("vote_average") or 0),
        "vote_count": int(movie.get("vote_count") or 0),
        "metadata_text": metadata_text,
    }


def discover_movies(
    session: requests.Session,
    genres_by_id: dict[int, str],
    pages_per_genre: int,
    min_votes: int,
) -> list[dict]:
    ids_by_name = {name: genre_id for genre_id, name in genres_by_id.items()}
    deduped: dict[int, dict] = {}

    for genre_name in DEFAULT_GENRES:
        genre_id = ids_by_name.get(genre_name)
        if not genre_id:
            print(f"Skipping unavailable TMDB genre: {genre_name}")
            continue

        print(f"Fetching {genre_name}")
        for page in range(1, pages_per_genre + 1):
            data = tmdb_get(
                session,
                "/discover/movie",
                language="en-US",
                include_adult="false",
                include_video="false",
                sort_by="vote_count.desc",
                with_genres=str(genre_id),
                **{"vote_count.gte": str(min_votes)},
                page=page,
            )

            for movie in data.get("results", []):
                item = normalize(movie, genres_by_id)
                if item:
                    deduped.setdefault(item["tmdb_id"], item)

            if page >= int(data.get("total_pages") or page):
                break
            time.sleep(0.08)

    return list(deduped.values())


def batched(items: list[dict], size: int):
    for start in range(0, len(items), size):
        yield items[start : start + size]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages-per-genre", type=int, default=3)
    parser.add_argument("--min-votes", type=int, default=100)
    parser.add_argument("--batch-size", type=int, default=64)
    args = parser.parse_args()

    load_dotenv()

    supabase_url = os.environ["SUPABASE_URL"]
    service_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    tmdb_token = os.environ["TMDB_READ_ACCESS_TOKEN"]

    session = requests.Session()
    session.headers.update(
        {
            "Authorization": f"Bearer {tmdb_token}",
            "accept": "application/json",
            "User-Agent": "Afterword/1.0 movie catalogue seeder",
        }
    )

    client = create_client(supabase_url, service_key)
    model = SentenceTransformer(MODEL_NAME)

    genres_by_id = genre_map(session)
    rows = discover_movies(
        session,
        genres_by_id,
        pages_per_genre=max(args.pages_per_genre, 1),
        min_votes=max(args.min_votes, 0),
    )
    print(f"Unique movies collected: {len(rows)}")

    for batch in batched(rows, max(args.batch_size, 1)):
        texts = [row["metadata_text"] for row in batch]
        embeddings = model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False,
        )

        payload = [
            {**row, "embedding": embedding.tolist()}
            for row, embedding in zip(batch, embeddings)
        ]

        client.table("movies").upsert(payload, on_conflict="tmdb_id").execute()
        print(f"Upserted {len(payload)} movies")

    print("Done.")


if __name__ == "__main__":
    main()
