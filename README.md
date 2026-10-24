# BodegaPro

Necesito crear una aplicación para manejo de bodega, está debe incluir base de datos y que los datos sean dinámicos al ingreso de información.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/861c68d2-1ef1-4729-bc79-76a0b4bc7ebc).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Seguridad antes de publicar

### Variables y claves

- Copia `.env.example` a `.env.local` para desarrollo y completa los valores localmente.
- `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_TURNSTILE_SITE_KEY` son valores públicos. La clave publicable de Supabase no reemplaza las políticas RLS.
- `SUPABASE_SERVICE_ROLE_KEY` y `BODEGAPRO_RESET_CODE` son secretos del servidor: guárdalos como secretos privados del Cloudflare Worker, nunca como variables `VITE_*`.
- El secreto de Turnstile se configura directamente en Supabase Auth; no se coloca en el navegador ni en este repositorio.
- Si una clave privilegiada se compartió o quedó expuesta, rótala en Supabase y actualiza el secreto del Worker. No la pegues en el chat ni en Git.

### Supabase Auth

En el panel de Supabase:

1. Configura la política de contraseñas con mínimo 12 caracteres y activa la protección contra contraseñas filtradas si tu plan lo permite. La aplicación también exige 12 caracteres al crear o cambiar la contraseña desde Configuración.
2. En **Authentication → Bot and Abuse Protection**, habilita CAPTCHA con **Cloudflare Turnstile** e ingresa el secret key del widget.
3. Ajusta los límites de solicitudes de Auth para el uso esperado de tu equipo; no los desactives.
4. Restringe **Site URL** y las URLs de redirección al dominio real de producción y a los orígenes locales necesarios.
5. Ejecuta las migraciones pendientes en orden. La migración `0014_require_admin_mfa.sql` aplica MFA a permisos ADMIN en RLS y operaciones administrativas del servidor.

En Cloudflare, define `VITE_TURNSTILE_SITE_KEY` en el entorno de compilación y almacena `SUPABASE_SERVICE_ROLE_KEY` y `BODEGAPRO_RESET_CODE` como secretos del Worker. La aplicación bloquea el inicio de sesión si no está configurada la clave pública de Turnstile.

### HTTPS en Cloudflare

Si publicas con un dominio propio, habilita **Always Use HTTPS** y usa **Full (strict)** entre Cloudflare y el origen. Activa HSTS solo después de comprobar que todo el dominio funciona exclusivamente con HTTPS. En Workers con dominio personalizado, verifica que el dominio esté asociado al Worker y que el certificado TLS esté activo.

### Segundo factor ADMIN

El primer inicio de sesión ADMIN debe completar la configuración TOTP con una aplicación autenticadora. Si se pierde el dispositivo, la recuperación debe hacerla un responsable desde el panel de Supabase; conserva acceso seguro a ese panel y no elimines el único factor activo sin un reemplazo.

Si en desarrollo local el usuario ADMIN queda bloqueado en el desafío MFA y no tiene el dispositivo autenticador, hay una recuperación manual que requiere la clave privada `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`:

```powershell
node --env-file=.env.local .\scripts\reset-admin-totp.mjs
```

El script solicita el correo ADMIN y una confirmación explícita; elimina únicamente sus factores TOTP y Supabase cierra las sesiones de esa cuenta. Luego se puede iniciar sesión de nuevo y registrar un autenticador. No ejecutes el script contra producción salvo que realmente quieras invalidar el MFA y las sesiones del ADMIN.
