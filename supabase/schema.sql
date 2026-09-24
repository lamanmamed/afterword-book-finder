-- Afterword book catalogue
-- Run in Supabase SQL Editor.

create extension if not exists vector with schema extensions;

create table if not exists public.books (
  openlibrary_key text primary key,
  title text not null,
  author text not null,
  cover_id bigint,
  first_publish_year integer,
  subjects text[] not null default '{}',
  ratings_average double precision,
  ratings_count integer not null default 0,
  edition_count integer not null default 0,
  metadata_text text not null,
  embedding extensions.vector(384) not null,
  updated_at timestamptz not null default now()
);

create index if not exists books_embedding_hnsw
on public.books
using hnsw (embedding vector_cosine_ops);

create index if not exists books_title_idx
on public.books using gin (to_tsvector('simple', title));

create index if not exists books_author_idx
on public.books using gin (to_tsvector('simple', author));

alter table public.books enable row level security;

drop policy if exists "Public read access to book catalogue" on public.books;
create policy "Public read access to book catalogue"
on public.books
for select
to anon, authenticated
using (true);

create or replace function public.match_books(
  query_embedding extensions.vector(384),
  match_count integer default 30,
  excluded_keys text[] default '{}'
)
returns table (
  openlibrary_key text,
  title text,
  author text,
  cover_id bigint,
  first_publish_year integer,
  subjects text[],
  ratings_average double precision,
  ratings_count integer,
  edition_count integer,
  similarity double precision
)
language sql
stable
as $$
  select
    b.openlibrary_key,
    b.title,
    b.author,
    b.cover_id,
    b.first_publish_year,
    b.subjects,
    b.ratings_average,
    b.ratings_count,
    b.edition_count,
    1 - (b.embedding <=> query_embedding) as similarity
  from public.books b
  where not (b.openlibrary_key = any(excluded_keys))
  order by b.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

grant select on public.books to anon, authenticated;
grant execute on function public.match_books(extensions.vector, integer, text[]) to anon, authenticated;
