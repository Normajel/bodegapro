# Etapa 49 — Registro preparado de Notas de Venta multiempresa

## Alcance

Se incorporó el módulo `/notas-venta` en la rama `multiempresa-desarrollo`, accesible desde el selector de empresa.

La nueva pantalla permite preparar una NV con número, cliente de la empresa activa, observaciones y entre 1 y 50 unidades, cada una con su propia cubicación **normal o especial** y cantidad. Hay validaciones de borrador y revisión previa. El botón **Registrar NV** permanece deshabilitado; no se realizan escrituras desde la web hasta completar pruebas con usuarios reales.

El historial de NV guardadas muestra las últimas 100 por empresa y, para cada documento, sus unidades, cantidades y número de materiales en el snapshot.

## Base de datos en Supabase independiente

Proyecto multiempresa: `vatpxpzdxstysvchyqqk`.

- `public.tenant_sales_notes`: empresa, número único en esa empresa, cliente vinculado mediante FK compuesta, nombre del cliente copiado, estado inicial `BORRADOR`, observaciones, usuario creador y fechas.
- `public.tenant_sales_note_units`: posición, tipo de cubicación, id, código de unidad, cantidad de módulos y **snapshot JSON del detalle de cubicación**.
- RLS: la lectura exige membresía activa en la empresa activa. Los roles `authenticated` no tienen INSERT, UPDATE ni DELETE directos.
- Trigger: impide actualizar o borrar los snapshots ya registrados, incluso por operaciones directas.
- RPC `create_tenant_sales_note`: registra encabezado y unidades de manera atómica, con validación de Auth, membresía activa ADMIN/ADMINPRO/VENTAS/VENTA, cliente propio, cubicaciones de la misma empresa, máximo de 50 unidades y 1000 módulos, número de NV único, copia de descripciones/costos/materiales y rechazo de cubicaciones vacías.
- `EXECUTE` revocado de `authenticated`, `anon` y `public`: es una operación **preparada pero no habilitada**.
- `sales-note-service.ts` dispone de un servicio para la posterior activación, con `SALES_NOTE_WRITES_ENABLED=false`.

## Pruebas SQL ejecutadas con ROLLBACK

- Perfil Ventas crea NV válida y snapshot de cubicación.
- Cambiar la cubicación original no modifica los materiales históricos de la NV.
- Si una cubicación no existe, falla toda la transacción, sin guardar encabezado parcial.
- Rechazo de intentos desde otra empresa.
- Perfil Bodega sin autorización de creación.

Estas cinco pruebas SQL pasaron. Se insertaron cuentas y documentos **temporales**, luego revertidos con `ROLLBACK`; no se guardaron ventas reales.

## Pendientes

1. Validación Auth, MFA, RLS y sesiones reales de dos empresas antes de habilitar escrituras.
2. Flujo de aprobación de NV por Gerencia, modificaciones trazadas y anulación motivada; actualmente solo existe estado BORRADOR inicial.
3. Vincular snapshots de cubicaciones a Producción, asignación de unidades, tiempos y trabajadores.
4. Cálculo presupuestario en la NV persistida; el simulador de etapa 48 es separado y de consulta.
5. Pruebas de navegador y despliegue independiente.

**Contemar, su base Supabase y la rama `main` no se modificaron.**
