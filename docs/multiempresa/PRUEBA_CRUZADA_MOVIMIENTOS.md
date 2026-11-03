# Etapa 24: prueba de aislamiento de movimientos
Fecha: 2026-11-02. Proyecto: INTEGRASTOCK Multiempresa.

Una transacción de prueba creó dos usuarios Auth temporales, dos empresas, dos membresías ADMIN separadas y un producto para cada empresa. Con contexto JWT simulado, se ejecutó `record_tenant_stock_movement`.

Resultados: A registra en A; A no puede registrar en B; stock B intacto; B registra en B; B no puede registrar en A. Cinco comprobaciones superadas. Transacción revertida por ROLLBACK.

Limitaciones: la prueba se ejecutó directamente por SQL con identidades simuladas. Faltan sesiones Auth/API reales, tests concurrentes, permisos de otros roles y pruebas de operaciones vinculadas a órdenes de compra. La función mantiene EXECUTE revocado a authenticated y frontend bloqueado.
