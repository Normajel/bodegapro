# Etapa 30 — Recepción de OC con dos productos

Prueba transaccional reversible en INTEGRASTOCK Multiempresa, sin modificar Contemar. Se crearon dos empresas, usuario BODEGA en una y ADMIN en la otra, dos productos y una OC aprobada con líneas de 10 y 6 unidades. Contexto JWT simulado dentro de SQL.

Resultados:
- BODEGA recepcionó 4 de 10 para producto A; OC parcial.
- BODEGA recepcionó 6 restantes de A; OC siguió parcial mientras B estaba pendiente.
- BODEGA recepcionó 6 de B; OC completa y stock A=10, B=6.
- El usuario de la otra empresa no pudo recepcionar la OC.

Se ejecutó ROLLBACK. No son sesiones reales de Supabase Auth ni pruebas concurrentes. La función de recepción se mantiene sin EXECUTE para authenticated.
