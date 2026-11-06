# IntegraStock Multiempresa — puesta en marcha de administración central

**Ámbito:** únicamente rama `multiempresa-desarrollo`, proyecto Supabase independiente `vatpxpzdxstysvchyqqk`. No usar en Contemar.

## Implementado en Supabase
- Plataforma con propietario explícito en `public.platform_administrators` (bootstrap de la única cuenta de prueba).
- Creación auditada de empresas y membresía AdminPro del propietario.
- Catálogo de planes con valor CLP, período y máximo de usuarios.
- Asignación y activación de suscripciones. El vencimiento impide nuevas invitaciones.
- Facturas administrativas y registro de pagos inicialmente `pending_verification`; confirmación manual con límite de monto.
- Invitación por Auth mediante Edge Function `platform-invite` con JWT, lista de administradores y cupo transaccional.
- Estado de invitación `sent` / `accepted` al confirmar el correo.
- Administración y operaciones con datos de auditoría.

## Seguridad verificada
- RPC no autorizadas rechazadas para identidad sin membresía.
- Sin EXECUTE para `anon` en RPC privilegiadas expuestas a `authenticated`.
- Facturación privada fuera del Data API; solo accesible mediante RPC controladas.
- Pruebas en transacciones con ROLLBACK: alta, suscripción, pago confirmado, rechazo de sobrepago, bloqueo de exceso de cupos, confirmación de invitación.
- No se han creado facturas/pagos reales ni enviado invitaciones de prueba.

## Pendiente antes de clientes reales
1. Publicar Vercel: plan Hobby alcanzó límite diario; versión del GitHub actual aún no está en la web.
2. Hacer pruebas con una cuenta Auth real invitada y cuenta no administradora (SMTP, email de invitación, redirección y límite del proveedor).
3. Añadir `https://integrastock-multiempresa.vercel.app/auth` en Auth > URL Configuration > Redirect URLs y configurar SMTP de dominio.
4. Para Auth > Sign In / Providers > Email, comprobar confirmación obligatoria, longitud/complexidad y expiración OTP <= 3600 s.
5. Leaked Password Protection requiere plan Supabase Pro o superior: activar en Authentication > Sign In / Providers > Email si la suscripción lo permite.
6. El Security Advisor continúa marcando funciones SECURITY DEFINER con EXECUTE para authenticated. Cada una requiere revisión de privilegios, RLS, carreras y acceso indirecto; no suprimir avisos ficticiamente.
7. El aislamiento de datos de las empresas se basa en RLS. **La suscripción NO bloquea automáticamente todas las rutas y tablas del ERP todavía**. Antes de vender, incorporar bloqueo transaccional y RLS por suscripción suspendida/vencida, conservando acceso a facturación y soporte.
8. No confundir facturas registradas internamente con facturas tributarias del SII; se necesita integración/validación tributaria independiente.
9. Invitaciones a cuentas Auth ya existentes y reenvíos de invitación requieren un flujo de aceptación específico.
10. Revisar seguridad de MFA y todos los módulos de escritura del cliente, incluyendo pruebas end-to-end.

## Qué probar después de publicar
1. AdminPro abre panel central y crea empresa/plan de prueba sin datos de Contemar.
2. Activa plan con cupo 1 y envía una sola invitación a correo nuevo; segunda debe rechazarse.
3. Aceptación de correo cambia invitación a `accepted` y permite acceso solo a la empresa asignada.
4. Una cuenta sin permisos globales no puede llamar a ninguna RPC `platform_*`.
5. Crear factura interna, registrar pago pendiente y confirmar solo tras comprobante verificable; sobrepago rechazado.
6. Verificar que ninguna otra empresa pueda ver stock, OC o pagos ajenos.
