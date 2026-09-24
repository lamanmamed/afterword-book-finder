"""Seed a Supabase pgvector catalogue from Open Library.

Usage:
    pip install -r scripts/requirements.txt
    cp .env.example .env
    python scripts/seed_catalog.py --limit-per-query 250

Requires a Supabase service-role key because this script writes catalogue rows.
Never expose the service-role key in the browser.
"""

from __future__ import annotations

import argparse
import os
import time
from typing import Iterable

import requests
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from supabase import create_client


SEARCH_URL = "https://openlibrary.org/search.json"
FIELDS = ",".join(
    [
        "key",
        "title",
        "author_name",
        "cover_i",
        "first_publish_year",
        "subject",
        "ratings_average",
        "ratings_count",
        "edition_count",
    ]
)

DEFAULT_QUERIES = [
    'subject:"literary fiction"',
    'subject:"fantasy"',
    'subject:"romance"',
    'subject:"historical fiction"',
    'subject:"mystery"',
    'subject:"science fiction"',
    'subject:"memoir"',
    'subject:"contemporary fiction"',
    'subject:"thriller"',
    'subject:"young adult fiction"',
]

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"


def clean_subjects(values: Iterable[str] | None) -> list[str]:
    if not values:
        return []
    seen = set()
    cleaned = []
    for value in values:
        item = " ".join(str(value).replace("(", "").replace(")", "").split()).strip()
        key = item.lower()
        if not item or len(item) > 45 or key in seen:
            continue
        seen.add(key)
        cleaned.append(item)
        if len(cleaned) == 12:
            break
    return cleaned


def normalize(doc: dict) -> dict | None:
    if not doc.get("key") or not doc.get("title") or not doc.get("author_name"):
        return None

    subjects = clean_subjects(doc.get("subject"))
    author = doc["author_name"][0]
    first_year = doc.get("first_publish_year")

    metadata_text = ". ".join(
        part
        for part in [
            doc["title"],
            f"by {author}",
            ", ".join(subjects),
            f"first published {first_year}" if first_year else "",
        ]
        if part
    )

    return {
        "openlibrary_key": doc["key"],
        "title": doc["title"],
        "author": author,
        "cover_id": doc.get("cover_i"),
        "first_publish_year": first_year,
        "subjects": subjects,
        "ratings_average": doc.get("ratings_average"),
        "ratings_count": int(doc.get("ratings_count") or 0),
        "edition_count": int(doc.get("edition_count") or 0),
        "metadata_text": metadata_text,
    }


def fetch_query(query: str, limit: int) -> list[dict]:
    rows: list[dict] = []
    page = 1
    page_size = min(100, limit)

    while len(rows) < limit:
        response = requests.get(
            SEARCH_URL,
            params={
                "q": query,
                "fields": FIELDS,
                "limit": page_size,
                "page": page,
                "language": "eng",
            },
            timeout=30,
        )
        response.raise_for_status()
        docs = response.json().get("docs", [])
        if not docs:
            break

        for doc in docs:
            item = normalize(doc)
            if item:
                rows.append(item)
                if len(rows) >= limit:
                    break

        page += 1
        time.sleep(0.15)

    return rows


def batched(items: list[dict], size: int):
    for start in range(0, len(items), size):
        yield items[start : start + size]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit-per-query", type=int, default=250)
    parser.add_argument("--batch-size", type=int, default=64)
    args = parser.parse_args()

    load_dotenv()

    supabase_url = os.environ["SUPABASE_URL"]
    service_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    client = create_client(supabase_url, service_key)
    model = SentenceTransformer(MODEL_NAME)

    deduped: dict[str, dict] = {}
    for query in DEFAULT_QUERIES:
        print(f"Fetching {query}")
        for row in fetch_query(query, args.limit_per_query):
            deduped.setdefault(row["openlibrary_key"], row)

    rows = list(deduped.values())
    print(f"Unique books collected: {len(rows)}")

    for batch in batched(rows, args.batch_size):
        texts = [row["metadata_text"] for row in batch]
        embeddings = model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False,
        )

        payload = []
        for row, embedding in zip(batch, embeddings):
            payload.append({**row, "embedding": embedding.tolist()})

        client.table("books").upsert(payload, on_conflict="openlibrary_key").execute()
        print(f"Upserted {len(payload)} books")

    print("Done.")


if __name__ == "__main__":
    main()
