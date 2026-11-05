# Etapa 50 — Aprobación NV y preparación de Producción multiempresa

**Destino:** `Normajel/bodegapro`, rama `multiempresa-desarrollo`. Base independiente `vatpxpzdxstysvchyqqk`. Contemar y `main` no fueron modificados.

## Estados y permisos

- `BORRADOR` → `PENDIENTE`, mediante `submit_tenant_sales_note`: ADMIN, ADMINPRO, VENTAS, VENTA con membresía activa en la misma empresa.
- `PENDIENTE` → `APROBADA`, mediante `approve_tenant_sales_note`: GERENCIA, GERENTE, ADMIN, ADMINPRO, con MFA AAL2 y membresía activa en la misma empresa.
- No se permiten segundas transiciones desde un estado incorrecto. Se usa bloqueo de la NV con `FOR UPDATE` para impedir aprobaciones concurrentes.
- Tabla `tenant_sales_note_events`: transición, empresa, fecha y usuario. Consulta RLS por membresía activa; sin INSERT/UPDATE/DELETE directos de usuarios web.
- Ambas funciones mantienen **EXECUTE revocado a authenticated, anon y public** hasta pruebas reales de autenticación.

## Preparación de producción

Al aprobar una NV, en la misma transacción se generan `tenant_production_units`: **una ficha por módulo físico** de las líneas guardadas en `tenant_sales_note_units`. Cada ficha registra la empresa, NV, línea de cubicación, índice de módulo, código de unidad y estado inicial `PENDIENTE_PLANIFICACION`.

- La FK compuesta protege que la ficha y su línea de NV pertenezcan a la misma empresa y Nota de Venta.
- No hay todavía asignación de jefatura, área, trabajador o cronometraje; solo preparación de las unidades para la futura programación.
- Las fichas no descuentan material, no crean reservas y no alteran la cubicación histórica.
- RLS permite consultar únicamente las fichas de empresas en las que el usuario tiene membresía activa.

## Interfaz

- Las NV muestran el estado legible y el historial de transiciones.
- La vista de Producción muestra NV, unidad, módulo físico y estado, con contador de módulos sin planificar.
- Los botones «Enviar a Gerencia» y «Aprobar NV» permanecen **deshabilitados**.
- Se añadieron reglas unitarias para controlar la elegibilidad de los roles/estados, sin sustituir las validaciones SQL.

## Pruebas SQL reversibles

Siete casos satisfactorios con usuarios temporales y `ROLLBACK`: Ventas envía NV y crea evento; segundo envío rechazado; Bodega no aprueba; MFA AAL2 obligatorio; Gerencia aprueba y genera tres módulos; segundo intento de aprobación no duplica módulos; rechazo de aprobación desde otra empresa.

**Estado de pruebas reales:** el Supabase nuevo permanece sin membresías reales. Las pruebas SQL son funcionales controladas, no una validación completa del navegador/autenticación.

## Pendientes

1. Crear y verificar usuarios empresariales reales en dos empresas DEMO; probar sesiones, MFA, RLS y permisos antes de abrir las dos RPC.
2. Programación de Producción por Gerencia: prioridad, fecha y capacidad, con autorización de Jefe de Producción; solo entonces permitir reasignaciones.
3. Recorrido por las áreas acordadas, trabajador y duración de cada instalación con descuento de pausas.
4. Auditoría de estados de cada módulo, recepción/entrega entre áreas y evidencia fotográfica.
5. Manejo de correcciones/anulación de NV, con motivo y trazabilidad, preservando snapshots históricos.
6. Confirmación de publicación independiente de Vercel.

No mezclar OC de productos con OC de servicios, ni confundir NV con OC.
