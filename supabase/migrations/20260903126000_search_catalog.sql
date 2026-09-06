-- Búsqueda global del catálogo (cursos + libros). Se implementa como RPC
-- security invoker para respetar RLS: un anon o un usuario sin sesión no ve
-- borradores; un admin sí. La extensión unaccent permite empatar "diseño" con
-- "diseno" sin castigar al usuario por escribir sin acentos.

create extension if not exists unaccent;

create or replace function public.search_catalog(query text, max_results integer default 5)
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with q as (
    select
      trim(coalesce(query, ''))                                        as raw,
      '%' || unaccent(lower(trim(coalesce(query, '')))) || '%'         as pattern,
      unaccent(lower(trim(coalesce(query, '')))) || '%'                as prefix
  ),
  matched_courses as (
    select
      c.id,
      c.slug,
      c.title,
      cat.name as category_name,
      c.cover_url,
      case when unaccent(lower(c.title)) like q.prefix then 0 else 1 end as rank
    from public.courses c
    join public.categories cat on cat.id = c.category_id
    cross join q
    where length(q.raw) > 0
      and unaccent(lower(coalesce(c.title, '') || ' ' ||
                         coalesce(c.description, '') || ' ' ||
                         cat.name)) like q.pattern
    order by rank, c.title
    limit greatest(max_results, 1)
  ),
  matched_books as (
    select
      b.id,
      b.slug,
      b.title,
      b.author,
      b.cover_url,
      case when unaccent(lower(b.title)) like q.prefix then 0 else 1 end as rank
    from public.books b
    cross join q
    where length(q.raw) > 0
      and unaccent(lower(coalesce(b.title, '') || ' ' ||
                         coalesce(b.author, '') || ' ' ||
                         coalesce(b.description, ''))) like q.pattern
    order by rank, b.title
    limit greatest(max_results, 1)
  )
  select jsonb_build_object(
    'courses', coalesce((select jsonb_agg(to_jsonb(matched_courses) - 'rank') from matched_courses), '[]'::jsonb),
    'books',   coalesce((select jsonb_agg(to_jsonb(matched_books)   - 'rank') from matched_books),   '[]'::jsonb)
  );
$$;

grant execute on function public.search_catalog(text, integer) to anon, authenticated;
