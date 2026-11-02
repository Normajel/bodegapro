# Módulo AdminPro: Suscripciones y cobros

Estado: esquema privado creado en Supabase INTEGRASTOCK Multiempresa, sin datos reales ni integración de cobros.

## Alcance
- Listar empresas y distinguir pruebas, suscripciones activas, atrasos, suspendidas y canceladas.
- Planes con tarifa en CLP, periodo mensual/anual y límite opcional de usuarios.
- Facturas/cuentas por cobrar con emisión, vencimiento, estado y monto.
- Pagos con referencia, fecha, medio y estado de verificación.
- Panel: MRR, ingreso cobrado, cuentas vencidas, próximas renovaciones, empresas activas.
- Historial auditado de alta, cambios de plan, suspensión, reactivación y conciliación.

## Seguridad y procesamiento
- Esquema billing NO expuesto al cliente; sin GRANT a authenticated/anon.
- Solamente AdminPro de plataforma, verificado por backend seguro en cada operación; no basta comprobar un rol en frontend.
- No usar rol ADMINPRO como pertenencia a empresa para conceder visibilidad global; implementar platform_admins independiente y verificación MFA.
- Cifrar/proteger datos personales y restringir referencias bancarias. No almacenar tarjetas, CVV ni credenciales de pasarelas.
- No confirmar pagos según declaraciones del cliente. Verificar con conciliación manual o webhook firmado de proveedor.
- Cambios financieros mediante endpoints protegidos con auditoría y control de concurrencia.
- Las facturas de billing son cuentas por cobrar internas, NO documentos tributarios SII.
- No activar suspensiones ni facturación automática hasta validar reglas comerciales, plazos y notificaciones.

## Próxima implementación
1. Provisionar identidades de AdminPro de plataforma y registros auditados.
2. Implementar endpoints privados autenticados y autorizados para lectura y cambios.
3. Construir panel AdminPro con filtros, listado, detalles y modal de registro.
4. Agregar alertas de vencimiento y métricas calculadas.
5. Agregar pruebas de permisos entre empresas, funciones billing y conciliación.
