-- Métricas del panel. Todo en una sola RPC para no encadenar seis consultas
-- distintas desde el layout del admin. SECURITY DEFINER + comprobación
-- explícita de rol: si el llamante no es admin, se rechaza aunque tenga
-- EXECUTE sobre la función.

create or replace function public.admin_metrics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'totalUsers', (
      select count(*) from public.profiles where deleted_at is null
    ),
    'activeSubscriptions', (
      select count(distinct user_id)
      from public.subscriptions
      where status = 'active'
    ),
    'onTrial', (
      select count(*)
      from public.profiles p
      where p.deleted_at is null
        and p.trial_started_at is not null
        and now() < p.trial_started_at
                    + (public.get_setting_int('trial_duration_minutes') || ' minutes')::interval
    ),
    'signupsLast30Days', (
      select count(*) from public.profiles
      where created_at > now() - interval '30 days'
    ),
    'revenueLast30DaysCents', coalesce((
      select sum(amount_cents) from public.payments
      where paid_at > now() - interval '30 days'
    ), 0),
    'paymentsLast30Days', (
      select count(*) from public.payments
      where paid_at > now() - interval '30 days'
    ),
    'topCourses', coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select c.id, c.slug, c.title, count(distinct lp.user_id) as learners
        from public.lesson_progress lp
        join public.lessons l on l.id = lp.lesson_id
        join public.modules m on m.id = l.module_id
        join public.courses c on c.id = m.course_id
        group by c.id, c.slug, c.title
        order by learners desc, c.title
        limit 5
      ) t
    ), '[]'::jsonb),
    'topBooks', coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select b.id, b.slug, b.title, count(distinct bp.user_id) as readers
        from public.book_progress bp
        join public.books b on b.id = bp.book_id
        group by b.id, b.slug, b.title
        order by readers desc, b.title
        limit 5
      ) t
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke execute on function public.admin_metrics() from public, anon;
grant execute on function public.admin_metrics() to authenticated;
