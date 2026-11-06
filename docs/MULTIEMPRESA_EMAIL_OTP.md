# Código de seis dígitos por correo — INTEGRASTOCK Multiempresa

La ruta `/auth` de `multiempresa-desarrollo` usa `supabase.auth.signInWithOtp` con `shouldCreateUser:false` y confirma con `verifyOtp({ email, token, type:"email" })`.

**Importante:** el OTP de Supabase es inicio de sesión **sin contraseña**; no es contraseña + segundo factor. Aplica a cada inicio de sesión nuevo, no obliga al usuario a introducir código cada vez que actualice una página mientras exista una sesión activa. Para exigir autenticación multifactor después de contraseña se necesita un diseño diferente (segundo factor independiente; Supabase TOTP es la alternativa estándar).

## Paso obligatorio en Supabase

Proyecto: `vatpxpzdxstysvchyqqk` (no modificar Contemar).

1. Authentication → Email Templates → **Magic Link**. Reemplazar su HTML por `supabase/email-templates/magic-link-otp.html`. Es imprescindible `{{ .Token }}`; si la plantilla conserva `{{ .ConfirmationURL }}` enviará un enlace en lugar de seis dígitos.
2. Authentication → Providers → Email: establecer vencimiento OTP (recomendado 600 segundos) y revisar límites de reenvío y de solicitudes. Configurar SMTP propio para entrega real y habilitar confirmación de correo.
3. Authentication → URL Configuration: verificar la Site URL y permitir `https://integrastock-multiempresa.vercel.app/auth`.
4. Verificar con un usuario invitado de una empresa activa. Nunca introducir OTP reales en GitHub ni en el chat.
5. La invitación inicial `inviteUserByEmail` es un flujo distinto del OTP de inicio de sesión; la invitación puede llegar como enlace y, una vez habilitada la cuenta, cada inicio de sesión será con OTP.
6. Controlar MFA/AAL2 por separado si lo requieren políticas de seguridad: OTP por correo no equivale a MFA con contraseña y aplicación autenticadora.

## Criterios de aceptación

- Solo usuarios ya creados en Auth pueden solicitar OTP; `shouldCreateUser:false` impide autoregistro.
- Cada nuevo inicio de sesión presenta captura de correo, petición de código, validación de seis dígitos y luego comprueba la membresía de empresa.
- Código erróneo o vencido no concede sesión.
- Código correcto sin membresía provoca cierre de sesión y mensaje de autorización denegada.
- La base y el despliegue de Contemar permanecen intactos.
- No se declara implementación completa hasta aplicar la plantilla en Supabase y comprobar un correo real y el flujo publicado.
