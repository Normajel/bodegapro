# INTEGRASTOCK ERP Multiempresa — Plan de separación (02-11-2026)

## Estado y reglas
- Código origen: Normajel/bodegapro, rama main. Rama de trabajo: multiempresa-desarrollo.
- NO modificar ni borrar datos, autenticación, configuraciones ni despliegue de Contemar.
- La rama de trabajo NO es un repositorio independiente; falta crear integrastock-multiempresa.
- Base productiva identificada: Supabase Contemar Project (mqgxgrozgntmkwjfubuh), con 174 productos al revisar.
- Proyecto prueba_1 (yqxvagafpkkoagubdruq) aparece sin tablas, pero NO usarlo sin acordar destino.
- Crear proyecto Supabase independiente según organización y presupuesto acordados; no copiar datos productivos.
- Configurar despliegue de pruebas y variables de entorno independientes; nunca copiar service_role al frontend.

## Requisitos
1. Clonar exactamente funcionalidad, UI, permisos, rutas, reportes y lógica de negocio de la aplicación original.
2. Base vacía de datos transaccionales: products, special_products, suppliers, customers, stock_movements, purchase_orders, purchase_entries, accepted_services, recepciones, cubicaciones ejecutadas, eventos, notificaciones y archivos de empresa. Conservar definiciones de catálogos, parámetros predeterminados y roles, sin registros privados.
3. Introducir companies(id, name, tax_id, status, created_at), company_memberships(company_id, user_id, role_id, status) y selección explícita de empresa activa. Los usuarios pueden pertenecer a varias empresas con distintos roles.
4. Incorporar company_id NOT NULL a tablas empresariales, con claves foráneas compuestas (company_id, entidad_id) donde corresponda, índices y unicidad por empresa para SKU, números de OC, etc.
5. Políticas RLS para SELECT/INSERT/UPDATE/DELETE que verifiquen pertenencia Y permisos, incluidas comprobaciones WITH CHECK en escrituras. Excluir accesos entre empresas incluso si un cliente manipula company_id.
6. Revisar todas las RPC SECURITY DEFINER, triggers, vistas, storage buckets y funciones de informes/exportación. No confiar en filtros de frontend para aislamiento.
7. AdminPro: administración de plataforma explícita y auditada; admins/gerencia/bodega/ventas limitados a sus empresas. MFA actual se conserva.
8. No cambiar inventario ni flujo de aprobaciones de Contemar durante desarrollo.

## Orden técnico
A. Respaldar repositorio, schema SQL, políticas, funciones, triggers y datos de la base productiva; documentar instantánea.
B. Crear repositorio independiente desde commit fijo de main, nuevo proyecto Supabase, despliegue y credenciales propios.
C. Recrear estructura de BD sin datos, inicializar catálogos de plataforma, RLS y usuarios de prueba.
D. Introducir empresas y membresías, adaptar relaciones en cada tabla, migrar APIs/RPC, frontend y reportes por módulos.
E. Ejecutar pruebas de aislamiento entre Empresa A y Empresa B para todas las operaciones (incluida aprobación, recepción parcial, anulación, productos especiales, cubicaciones).
F. Crear proceso idempotente de importación de Contemar con mapa legacy_id -> nuevo_id. Primero catálogos y proveedores, luego productos y cubicaciones, órdenes/ítems, recepciones/movimientos y auditoría. Conciliar conteos, valoraciones y saldos de stock; no duplicar entradas. Usuarios/Auth migran por vía separada, preservando relaciones sin copiar contraseñas.
G. Migración piloto; cambio final sólo con autorización y ventana de corte. Aplicación original disponible para reversión.

## Criterios de aceptación
- Una empresa recién creada inicia sin productos ni movimientos.
- Ningún usuario puede leer/escribir otra empresa mediante API directa, RPC, vistas o archivos.
- Las operaciones con referencias cruzadas a otras empresas se rechazan en BD.
- Mismo comportamiento de compras, servicios, productos especiales, inventario, recepción, anulaciones, cubicaciones, PDF y permisos que BodegaPro.
- Contemar se puede importar a una empresa nueva con conciliación de registros y sin sobrescribir su base original.

## Bloqueadores externos
- El conector GitHub disponible no expone creación de repositorios nuevos; crear el repo en GitHub o habilitar otra vía de creación.
- Para crear un proyecto Supabase nuevo, seleccionar explícitamente la organización y confirmar cualquier cargo solicitado.
