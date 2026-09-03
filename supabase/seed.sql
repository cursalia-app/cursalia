-- Datos mínimos para arrancar en local.
-- No crea usuarios: eso lo hace Supabase Auth al registrarse desde /registro.
-- Para convertir a alguien en administrador, después de que se registre:
--   update public.profiles set is_admin = true where email = 'tu@correo.com';

insert into public.categories (name, slug, position, status) values
  ('Inteligencia Artificial', 'inteligencia-artificial', 0, 'published'),
  ('Programación',            'programacion',            1, 'published'),
  ('Marketing Digital',       'marketing-digital',       2, 'published'),
  ('Diseño',                  'diseno',                  3, 'published'),
  ('Negocio',                 'negocio',                 4, 'published')
on conflict (slug) do nothing;
