-- Afterword movie catalogue
-- Run in Supabase SQL Editor after supabase/schema.sql.
-- This is additive: it does not modify the existing books table or match_books function.

create extension if not exists vector with schema extensions;

create table if not exists public.movies (
  tmdb_id bigint primary key,
  title text not null,
  original_title text,
  release_year integer,
  genres text[] not null default '{}',
  overview text not null default '',
  poster_path text,
  popularity double precision,
  vote_average double precision,
  vote_count integer not null default 0,
  metadata_text text not null,
  embedding extensions.vector(384) not null,
  updated_at timestamptz not null default now()
);

create index if not exists movies_embedding_hnsw
on public.movies
using hnsw (embedding extensions.vector_cosine_ops);

create index if not exists movies_title_idx
on public.movies using gin (to_tsvector('simple', title));

alter table public.movies enable row level security;

drop policy if exists "Public read access to movie catalogue" on public.movies;
create policy "Public read access to movie catalogue"
on public.movies
for select
to anon, authenticated
using (true);

create or replace function public.match_movies(
  query_embedding extensions.vector(384),
  match_count integer default 30,
  excluded_ids bigint[] default '{}'
)
returns table (
  tmdb_id bigint,
  title text,
  original_title text,
  release_year integer,
  genres text[],
  overview text,
  poster_path text,
  popularity double precision,
  vote_average double precision,
  vote_count integer,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.tmdb_id,
    m.title,
    m.original_title,
    m.release_year,
    m.genres,
    m.overview,
    m.poster_path,
    m.popularity,
    m.vote_average,
    m.vote_count,
    1 - (m.embedding OPERATOR(extensions.<=>) query_embedding) as similarity
  from public.movies m
  where not (m.tmdb_id = any(coalesce(excluded_ids, '{}')))
  order by m.embedding OPERATOR(extensions.<=>) query_embedding
  limit least(greatest(coalesce(match_count, 30), 1), 100);
$$;

create or replace function public.search_movies(
  search_query text,
  result_count integer default 24
)
returns table (
  tmdb_id bigint,
  title text,
  original_title text,
  release_year integer,
  genres text[],
  overview text,
  poster_path text,
  popularity double precision,
  vote_average double precision,
  vote_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.tmdb_id,
    m.title,
    m.original_title,
    m.release_year,
    m.genres,
    m.overview,
    m.poster_path,
    m.popularity,
    m.vote_average,
    m.vote_count
  from public.movies m
  where
    search_query is null
    or btrim(search_query) = ''
    or m.title ilike '%' || btrim(search_query) || '%'
    or coalesce(m.original_title, '') ilike '%' || btrim(search_query) || '%'
  order by
    case
      when lower(m.title) = lower(btrim(search_query)) then 0
      when lower(m.title) like lower(btrim(search_query)) || '%' then 1
      else 2
    end,
    m.vote_count desc,
    m.popularity desc
  limit least(greatest(coalesce(result_count, 24), 1), 100);
$$;

grant select on public.movies to anon, authenticated;
grant execute on function public.match_movies(extensions.vector, integer, bigint[]) to anon, authenticated;
grant execute on function public.search_movies(text, integer) to anon, authenticated;
