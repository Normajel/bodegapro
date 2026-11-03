# Etapa 25 — Folios y asociación entre empresas

Proyecto: Supabase INTEGRASTOCK Multiempresa; Contemar sin cambios.

En una transacción SQL se crearon dos empresas temporales, un producto por empresa y tres movimientos secuenciales (dos en empresa A y uno en B).

Comprobaciones superadas:
- Los folios de ambos movimientos de empresa A son diferentes.
- Dos movimientos quedan asociados a A y uno a B.
- Se ejecutó ROLLBACK, sin persistir entidades temporales.

**Limitación importante:** no se ejecutaron llamadas verdaderamente simultáneas en sesiones independientes. La identidad `folio` se genera desde una secuencia global y no garantiza numeración consecutiva por empresa, aunque existe una restricción UNIQUE(company_id,folio). La función de stock sigue sin EXECUTE para authenticated hasta completar pruebas de concurrencia, autenticación real y las recepciones de OC.
