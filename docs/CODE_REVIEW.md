# Code review y plan de producción · DADINI SaaS

## Resumen
Revisión senior del código existente. El sistema es funcional y extenso; se aplicaron mejoras de seguridad, arquitectura, rendimiento y mantenibilidad sin romper módulos.

## Hallazgos y correcciones aplicadas

| # | Hallazgo | Riesgo | Acción |
|---|---|---|---|
| 1 | `app.get('*')` registrado antes del middleware 404 devolvía `index.html` para rutas API no existentes | Medio | Se limitó el catch-all a rutas no `/api` ni `/uploads`. |
| 2 | Sin `helmet`, sin rate limiting y con `x-powered-by` | Alto | Se agregaron Helmet, `express-rate-limit` y `app.disable('x-powered-by')`. |
| 3 | `JWT_SECRET` por defecto en producción | Alto | `src/config.js` valida y advierte; usar variable de entorno. |
| 4 | Mapa con coordenadas nulas/réplica de strings provocaba excepción en Leaflet | Medio | Normalización y filtrado de coordenadas en `Mapa.jsx`. |
| 5 | Aumentos en entrega consumían stock antes de validar, dejando devoluciones a cero tras un error | Alto | Validación previa de stock disponible en `ajustarPedidoEntrega`. |
| 6 | Rechazo total no generaba devolución | Medio | Se crea devolución automática con todos los ítems. |
| 7 | Persistencia acoplada a un único destino | Medio | Adaptador `store.js` + sincronización Supabase con outbox. |
| 8 | Configuración de marca hardcodeada | Medio | `branding` configurable + `BrandStyle` con variables CSS. |
| 9 | APK sin canal de distribución | Medio | Carga restringida a admin/dueno, servida por `/uploads` y compartible por WhatsApp. |
| 10 | Nombres generales en código nuevo | Bajo | Nuevos módulos usan nombres descriptivos (`sincronizarCargaRemota`, `ajustarPedidoEntrega`, `BrandStyle`, `Personalizacion`). |

## Cuellos de botella detectados

1. **Persistencia full-JSON en cada escritura**: `save()` serializa y reescribe todo el documento en PostgreSQL. Con 200 clientes y cientos de pedidos es aceptable, pero a mayor escala conviene migrar a tablas normalizadas o event sourcing.
2. **Cálculo de dashboard en cada petición**: se recorren todos los pedidos del período. Recomendable caché por período con invalidación al guardar.
3. **Bundle frontend > 1 MB**: Leaflet + SheetJS son pesados. Recomendable code splitting con `React.lazy` para Reportes, Mapa y Personalización.
4. **Polling cada 15 s**: funciona, pero Supabase Realtime o WebSockets reducirían latencia y tráfico.

## Recomendaciones prioritarias
- Definir `JWT_SECRET`, `CORS_ORIGIN` y credenciales Supabase antes de producción.
- Crear la tabla `saas_snapshots` con RLS en Supabase (el SQL está en Personalización → Nube).
- Usar HTTPS para geolocalización real en móviles.
- Programar respaldos de `G:\DADINI_DATOS\DADINI_SAAS`.
- Ejecutar `npm audit` periódicamente y fijar dependencias con lockfile.

## Estado
Sistema activo con todos los módulos operativos; mejoras aplicadas y verificadas con `npm test` y `npm run build`.
