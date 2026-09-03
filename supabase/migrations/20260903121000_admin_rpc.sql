-- Operaciones de administración que deben ocurrir en UNA transacción.
-- Se exponen como RPC para que el panel no pueda dejarlas a medias.

-- Reordena en bloque: la posición de cada fila es su índice en el array.
-- Se usa al arrastrar en el panel; el orden nunca es alfabético.
create or replace function public.reorder_entity(entity text, ordered_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  case entity
    when 'category' then
      update public.categories c
        set position = idx.position
        from (select unnest(ordered_ids) as id, generate_subscripts(ordered_ids, 1) - 1 as position) idx
        where c.id = idx.id;
    when 'course' then
      update public.courses c
        set position = idx.position
        from (select unnest(ordered_ids) as id, generate_subscripts(ordered_ids, 1) - 1 as position) idx
        where c.id = idx.id;
    when 'module' then
      update public.modules m
        set position = idx.position
        from (select unnest(ordered_ids) as id, generate_subscripts(ordered_ids, 1) - 1 as position) idx
        where m.id = idx.id;
    when 'lesson' then
      update public.lessons l
        set position = idx.position
        from (select unnest(ordered_ids) as id, generate_subscripts(ordered_ids, 1) - 1 as position) idx
        where l.id = idx.id;
    when 'book' then
      update public.books b
        set position = idx.position
        from (select unnest(ordered_ids) as id, generate_subscripts(ordered_ids, 1) - 1 as position) idx
        where b.id = idx.id;
    else
      raise exception 'unknown_entity: %', entity;
  end case;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
  values (auth.uid(), 'reorder', entity, null, jsonb_build_object('ordered_ids', to_jsonb(ordered_ids)));
end;
$$;

-- Cambia el estado y graba published_at SOLO en la primera publicación.
create or replace function public.set_content_status(entity text, target_id uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  previous text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  if new_status not in ('draft','published','archived') then
    raise exception 'unknown_status: %', new_status;
  end if;

  case entity
    when 'category' then
      select status into previous from public.categories where id = target_id;
      update public.categories set status = new_status where id = target_id;
    when 'course' then
      select status into previous from public.courses where id = target_id;
      update public.courses
        set status = new_status,
            published_at = case
              when new_status = 'published' then coalesce(published_at, now())
              else published_at
            end
        where id = target_id;
    when 'book' then
      select status into previous from public.books where id = target_id;
      update public.books
        set status = new_status,
            published_at = case
              when new_status = 'published' then coalesce(published_at, now())
              else published_at
            end
        where id = target_id;
    else
      raise exception 'unknown_entity: %', entity;
  end case;

  if previous is null then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
  values (auth.uid(), 'change_status', entity, target_id,
          jsonb_build_object('from', previous, 'to', new_status));
end;
$$;

grant execute on function public.reorder_entity(text, uuid[]) to authenticated;
grant execute on function public.set_content_status(text, uuid, text) to authenticated;
