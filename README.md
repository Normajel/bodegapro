# BodegaPro

Aplicación web para la gestión de bodega: inventario, compras, movimientos, contactos e informes, con base de datos y datos dinámicos.

**Tecnologías:** TanStack Start · React 19 · Supabase (base de datos, autenticación y RLS) · Tailwind CSS v4 · Cloudflare Workers. Proyecto conectado a [Lovable](https://lovable.dev).

## Módulos

- **Panel:** resumen del inventario y alertas de stock crítico.
- **Inventario:** productos, stock, costo unitario con tendencia de precio, importación y planilla Excel.
- **Órdenes de compra:** creación con servicios, condiciones de pago e IVA; filtros por recepción y estado; aprobación solo para ADMIN y GERENTE.
- **Movimientos:** entradas y salidas, y compras y ventas registradas con edición y anulación.
- **Contactos:** proveedores y maestros.
- **Informes:** precios, inventario, stock crítico, movimientos y pendientes, con paginación y exportación a Excel.
- **Configuración:** usuarios, roles y permisos.

Se accede con **usuario y contraseña**; el correo se usa solo para recuperación y autenticación. El rol ADMIN requiere segundo factor (TOTP).

## Puesta en marcha

Requiere Node.js y npm.

```sh
npm i
cp .env.example .env.local   # en PowerShell: Copy-Item .env.example .env.local
npm run dev
```

| Comando | Uso |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm test` | Pruebas (Vitest) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## Base de datos

Las migraciones están en `drizzle/migrations` y se ejecutan **en orden** en el SQL Editor de Supabase. Aplica todas las pendientes después de actualizar el código.

## Seguridad

- `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_TURNSTILE_SITE_KEY` son públicas; la protección real son las políticas RLS.
- `SUPABASE_SERVICE_ROLE_KEY` y `BODEGAPRO_RESET_CODE` son secretos del servidor: guárdalos como secretos del Worker, nunca como variables `VITE_*` ni en Git. Si se expusieron, rótalas en Supabase.
- En Supabase Auth: contraseña de mínimo 12 caracteres, CAPTCHA con Cloudflare Turnstile, límites de solicitudes activos y URLs de redirección restringidas a tus dominios.
- En Cloudflare: activa **Always Use HTTPS** y **Full (strict)**.

### Recuperar el segundo factor del ADMIN

Si el ADMIN pierde su autenticador en desarrollo local, con `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`:

```powershell
node --env-file=.env.local .\scripts\reset-admin-totp.mjs
```

El script elimina solo los factores TOTP de esa cuenta y cierra sus sesiones. No lo uses en producción salvo que realmente quieras invalidar el MFA.
