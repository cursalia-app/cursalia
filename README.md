# Cursalia

Plataforma de formación por suscripción: un único plan abre todo el catálogo de
cursos en vídeo y la biblioteca de libros. Los clientes pueden actuar como
afiliados y cobrar una comisión fija por cada persona que traen.

## Stack

Next.js 16 (App Router, React Server Components) · TypeScript · Tailwind CSS ·
Supabase (PostgreSQL + Auth + RLS) · Bunny Stream y Bunny Storage · Vercel.

## Puesta en marcha

```bash
npm install
cp .env.local.example .env.local   # y rellenar
npm run dev
```

### 1. Supabase

Crea un proyecto en [supabase.com](https://supabase.com) y aplica las migraciones:

```bash
npx supabase link --project-ref <ref-del-proyecto>
npx supabase db push
npx supabase db execute --file supabase/seed.sql   # categorías de ejemplo
```

En **Authentication → Providers → Email**, deja activada la confirmación de
correo: la prueba gratuita no arranca hasta que el usuario verifica (RN-03).
En **URL Configuration**, añade `http://localhost:3000/verificar` y
`http://localhost:3000/recuperar/nueva` como redirecciones permitidas.

Copia a `.env.local` la URL del proyecto, la clave `anon` y la `service_role`.

### 2. Hacerte administrador

Regístrate desde `/registro`, verifica el correo y después, en el editor SQL de
Supabase:

```sql
update public.profiles set is_admin = true where email = 'tu@correo.com';
```

A partir de ahí verás el panel en `/admin`.

### 3. Bunny

Crea una **Stream Library** y una **Storage Zone**. De cada una necesitas la
clave de API, el nombre del host CDN y la clave de firma de URLs (*Token
Authentication*), que hay que activar en ambas. Todo va a `.env.local`.

En la *pull zone* de la Storage Zone hay que **habilitar las cabeceras CORS**
para el dominio del sitio. El visor de libros lee el PDF desde el navegador con
pdf.js, y sin CORS el archivo se descarga pero no se puede pintar.

### 4. Pagos

El cobro es **manual**: se gestiona por fuera de la aplicación (transferencia,
Bizum, lo que se acuerde con cada cliente). Cursalia solo registra hasta qué
fecha se ha pagado y quién lo tramitó.

**Flujo cotidiano:**

1. Cliente se registra y verifica el correo → arranca su prueba de 30 minutos.
2. Cliente hace el pago por su vía.
3. Vas a **Panel → Usuarios**, buscas por correo y pulsas **Extender**:
   introduces los meses (por defecto 1) y opcionalmente el importe cobrado.
   Si declaras importe, se registra el pago y, si el cliente vino por un
   referido, se genera la comisión de afiliado.
4. Cuando se acerca la fecha de fin, el **Panel → Vencimientos** te avisa.
   Si el cliente no renueva, el acceso se corta solo al pasar la fecha; no
   hay que hacer nada. Si prefieres cortar antes: botón **Cortar**.

El webhook `POST /api/webhooks/payments` sigue existiendo por si en el
futuro se enchufa una pasarela. Su especificación completa está en
`src/lib/services/billing-service.ts`. Con `PAYMENTS_WEBHOOK_SECRET` sin
configurar, el endpoint responde 503 y no acepta eventos.

## Cargar contenido

Desde el panel puedes crear y editar todo a mano: categorías, cursos, temas,
capítulos y libros, con reordenación por arrastre y publicación por estados.

Para traer carpetas enteras que hoy viven en Google Drive:

```bash
# Sincroniza la carpeta con la app de escritorio de Drive y apunta aquí.
node scripts/drive-to-bunny/index.mjs "D:/Drive/Mi curso" --dry-run
node scripts/drive-to-bunny/index.mjs "D:/Drive/Mi curso" > curso.json
```

Cada subcarpeta se convierte en un Tema y cada vídeo en un Capítulo. El JSON
resultante se pega en **Panel → Importar**: el curso aparece completo y en
borrador, listo para revisar antes de publicar.

## Gestión desde el panel

- **Usuarios**: extender o cortar accesos, promover a admin, cerrar cuentas
  (baja RGPD que anonimiza correo e IP conservando el histórico de pagos).
  Un admin no puede cerrar su propia cuenta ni quitarse el rol a sí mismo.
- **Vencimientos**: dashboard con quién caduca en los próximos días y quién
  ya caducó; clic lleva al usuario en el listado con las acciones a mano.
- **Ajustes**: duración de la prueba, cooldown de trial por IP, precio de la
  suscripción, comisión de afiliado, días de cortesía, límite de dispositivos.
- **Comisiones**: repasar y marcar como pagadas.

Todo cambio importante queda en `audit_log`, con el hash del correo previo
en las bajas para poder correlacionar sin exponer PII.

## Verificación

```bash
psql "$DATABASE_URL" -f supabase/security-smoke.sql
```

Comprueba que los guards, RLS, policies, índices y RPCs siguen bien tras
cualquier migración. Silencio = todo correcto.

## Comandos

```bash
npm run dev         # desarrollo
npm run build       # compilación de producción
npm test            # tests de los servicios
npm run typecheck   # TypeScript sin emitir
npm run lint        # ESLint
```

## Cómo está organizado

```
src/
  app/
    (auth)/      registro, entrada, verificación, recuperación
    (app)/       zona autenticada: inicio, catálogo, biblioteca, afiliados, cuenta
    (player)/    reproductor y visor, a pantalla completa
    (admin)/     panel
    api/         URLs firmadas, alta de dispositivo, webhook de pagos
  lib/
    services/    TODA la lógica de negocio
    supabase/    clientes de servidor, navegador y service_role
    validation/  esquemas Zod
    types/       tipos de dominio y de la base de datos
  components/
supabase/
  migrations/    esquema, funciones, triggers y policies RLS
scripts/
  drive-to-bunny/  ingesta masiva, fuera de la aplicación
```

## Decisiones que conviene conocer antes de tocar el código

**El acceso se calcula, nunca se almacena ni se revoca.** La regla vive una sola
vez, en la función SQL `public.has_content_access`, que usan todas las policies
RLS y que `access-service` consulta. Está prohibido comparar fechas de prueba o
estados de suscripción en cualquier otro sitio, y está prohibido crear cualquier
cron o proceso que quite acceso: a los 30 minutos, la siguiente petición
sencillamente no recibe URL firmada.

**Ninguna URL de vídeo o libro se genera sin comprobar el acceso en el
servidor.** Caducan en `min(4 h, fin del acceso)` y van atadas a la IP que las
pidió. El navegador nunca las construye.

**El progreso se guarda solo en la hoja** —el segundo de un capítulo, la página
de un libro— y los porcentajes de tema, curso y global se calculan al vuelo. No
existe ninguna columna de agregado que pueda desincronizarse.

**El webhook de pagos es idempotente por diseño.** El mismo evento dos veces deja
exactamente el mismo estado: lo garantizan la unicidad de `webhook_events`, la de
`payments.external_payment_id` y la de `commissions.referred_user_id`.

**En la interfaz se dice siempre "Tema" y "Capítulo".** En la base de datos son
`modules` y `lessons`. Nunca al revés.

Los documentos de producto (`context.md`, `PRD.md`, `ARCHITECTURE.md`) son la
fuente de verdad del lenguaje del proyecto. Si algo del código los contradice, el
código está mal.
