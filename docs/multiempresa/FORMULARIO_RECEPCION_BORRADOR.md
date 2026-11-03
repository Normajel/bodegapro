# Formulario de recepción de órdenes de compra — borrador seguro

Aplicado a `multiempresa-desarrollo`, sin cambios en `main` ni en Contemar.

## Componentes
- `TenantReceiptDraftForm.tsx`: prepara cantidades por producto de inventario pendientes, guía/factura, número de documento y observaciones.
- Se monta bajo la OC seleccionada y separa su estado por empresa y orden para no reutilizar borradores anteriores.
- Omite servicios y productos especiales en el formulario de stock normal. Los productos totalmente recibidos tampoco tienen un campo editable.
- Validaciones de enteros positivos, cantidades que no superen el pendiente, tipo de documento y número obligatorio.
- `receipt-validation.test.ts` incluye pruebas de cantidades y documentos.
- El botón de registro está deshabilitado: no se invoca ninguna RPC ni se altera el stock.

## Pendiente para activar la operación
1. Autenticación real de BODEGA y permisos por empresa.
2. RPC transaccional de recepción validada bajo sesiones reales y conexiones concurrentes.
3. Documentos de respaldo persistidos en el movimiento, incluyendo fecha y folio.
4. Operación única accesible desde Órdenes de compra y Movimientos, con reintentos idempotentes.
5. Actualización invalidando las consultas de OC, productos, movimientos y recepciones tras guardar.

La compilación de Vercel y GitHub Actions deberán confirmarse después de esta edición.
