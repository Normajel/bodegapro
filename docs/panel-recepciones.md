# Panel de recepciones: datos faltantes y presentación móvil

El plazo vigente comienza en el primer envío exitoso registrado. Sin envío y/o sin delivery_days no existe una fecha límite verificable. Aprobar una OC no implica que se haya enviado. No se crean fechas ni se marcan como vencidas órdenes sin esos datos.

El panel muestra conteos separados para en plazo, próximas a vencer, vencidas, sin seguimiento, completadas y por aprobar. El aviso identifica cuántas OC pendientes carecen de envío o de plazo y aclara que una misma OC puede tener ambos pendientes. Las fechas ausentes indican el motivo en lugar de mostrar un guion.

El botón Revisar OC abre la trazabilidad y permite configurar el plazo o revisar el envío según los permisos existentes. La corrección no envía correos automáticamente. Los envíos realizados por otros medios no tienen evidencia registrada en este módulo.

Celulares y tablet usan tarjetas con cantidades pedidas, recibidas y pendientes por separado, estado completo y fecha o motivo faltante. La tabla se reserva para pantallas grandes. Carga y error no se representan como contadores cero.

Validación: 83 pruebas existentes y de regresión aprobadas, compilación de producción y ESLint de archivos modificados sin errores. Los nuevos casos prueban datos faltantes, filtros, apertura de la OC con permisos de solo lectura y ausencia de ceros ficticios ante errores. La inspección visual con navegador automatizado no estuvo disponible en el entorno.
