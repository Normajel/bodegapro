# Etapa 36 — Ensayo de recepciones concurrentes (dos solicitudes)

Supabase: INTEGRASTOCK Multiempresa `vatpxpzdxstysvchyqqk`; Contemar no fue modificado.

## Configuración
Se sembraron temporalmente una empresa, usuario Auth temporal con membresía BODEGA, proveedor, producto, orden aprobada por 5 unidades y línea de OC. Se ejecutaron **dos solicitudes SQL separadas lanzadas en paralelo** por el conector Supabase; cada solicitud utilizó transacción propia, identidad JWT simulada, identificador idempotente distinto y documento distinto. Ambas pidieron recibir 4 unidades.

## Resultados
- Solicitud A: aceptada, devuelve identificador de operación.
- Solicitud B: rechazada por `Receipt exceeds pending quantity` en `receive_tenant_purchase_order_batch`.
- Verificación posterior: `stock=4`, `stock_quantity=4`, `received_quantity=4` de `quantity=5`, estado OC `parcial`, **1 movimiento y 1 lote**.
- Eliminación de fixtures confirmada: empresas=0, membresías=0, productos=0, OC=0, movimientos=0, lotes=0, usuarios Auth=0.
- Permisos `EXECUTE` de `authenticated` para funciones batch, individual y movimiento: falsos.
- Analizador de seguridad: seis avisos INFO de tablas sin políticas (privadas/intencionalmente cerradas).

## Alcance de evidencia
La prueba lanzó dos llamadas paralelas y verificó el saldo final y la ausencia de duplicaciones; no obtuvo trazas de inicio/fin dentro de PostgreSQL para demostrar solapamiento exacto de intervalos. No se probaron sesiones válidas iniciadas por la API de Supabase Auth: se simuló el contexto de JWT mediante SQL. Aún faltan ensayos end-to-end con cuentas reales, dispositivo móvil y token expirado, así como ensayos repetidos de alta carga.

## Próxima acción
Preparar usuarios reales de prueba de manera segura en Supabase Auth y validar el flujo autenticado y RLS desde el frontend. Mantener deshabilitado el botón Registrar recepción hasta completar estas pruebas.
