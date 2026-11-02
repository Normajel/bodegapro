# Verificación de aislamiento — etapa 15

Proyecto de pruebas: Supabase INTEGRASTOCK Multiempresa (no Contemar).
Fecha: 2026-11-02.

## Comprobaciones ejecutadas
1. Se generaron dos identificadores de empresa dentro de una transacción de prueba.
2. Se registró temporalmente un producto asignado a la empresa A.
3. Se intentó referenciar ese producto desde una cubicación perteneciente a la empresa B. La restricción FK rechazó la relación.
4. Un filtro explícito `products.company_id = B` no retornó el producto asignado a A.
5. Se deshicieron las inserciones mediante un bloque de excepción; comprobación posterior: cero empresas, productos y membresías.
6. Security Advisor: cuatro avisos INFO por las tablas del esquema privado `billing`, intencionalmente cerradas sin políticas. No equivale a una prueba de seguridad completa.

## Lo que aún NO se ha comprobado
- Usuarios autenticados reales de dos empresas con diferentes roles.
- Denegación RLS para lectura y escritura en productos, proveedores, compras y movimientos.
- Aislamiento de los loaders/server functions antiguos de TanStack.
- Compilación y tests automatizados del frontend.
- Switching entre empresas sin visualización momentánea de caché previa.
- Despliegue independiente de la rama y repositorio separado.

## Criterio para retirar bloqueos
No habilitar altas/ediciones/recepciones hasta comprobar con dos cuentas de prueba auténticas que RLS y procedimientos transaccionales nunca leen ni alteran otra empresa. Mantener rama `main` y proyecto original fuera de cambios.
