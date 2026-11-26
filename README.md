# DADINI SaaS

Panel de gestión SaaS para **DADINI** (snacks bolivianos): ventas, distribución, inventario, cobranzas y administración en una sola aplicación.

La estética está inspirada en el catálogo real de DADINI: azul marino `#061C33`, naranja `#FF6500` y tipografía Inter. La moneda es el boliviano (Bs) y el idioma de la interfaz es español.

---

## 1. Arranque rápido

Requisitos: **Node.js 20 o superior** (probado con Node 24) y Windows.

```bat
INICIAR_DADINI.bat
```

El script instala dependencias si hace falta, levanta la API y la web, y abre el navegador.

### Arranque manual

```bat
cd dadini-saas\backend
npm install
npm start
```

En otra terminal:

```bat
cd dadini-saas\frontend
npm install
npm run dev
```

| Servicio | URL |
| --- | --- |
| Aplicación web | http://localhost:5180 |
| API | http://localhost:5055/api |
| Salud de la API | http://localhost:5055/api/health |

---

## 2. Accesos demo

Todas las cuentas usan la contraseña **`Dadini2026!`**.

| Rol | Correo | Puede ver |
| --- | --- | --- |
| Administrador | `admin@dadini.bo` | Todo el sistema |
| Ventas | `ventas@dadini.bo` | Ventas, clientes, cobranzas, reportes |
| Almacén | `almacen@dadini.bo` | Inventario, productos, almacenes |
| Distribución | `rutas@dadini.bo` | Distribución, rutas, entregas |
| Cobranzas | `cobranzas@dadini.bo` | Cobranzas y clientes |

En la pantalla de login también hay botones de acceso rápido para cada perfil.

---

## 3. Base de datos

El motor principal es **PostgreSQL `DADINI_DB`** (el mismo proyecto que respalda `G:\DADINI_DATOS`), usando un esquema dedicado para no tocar las tablas reales de DADINI:

```text
PostgreSQL · localhost:5432/DADINI_DB · esquema dadini_saas
```

Tablas del esquema: `usuarios`, `almacenes`, `productos`, `stock`, `clientes`, `pedidos`, `pagos`, `movimientos`, `rutas`, `repartidores`, `vehiculos`, `auditoria`, `notificaciones`, `visitas` y `meta`.

Conexión en `backend/.env` (valores tomados de `G:\DADINI_API\.env`):

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=DADINI_DB
DB_USER=postgres
DB_PASSWORD=*****
DADINI_DATA_DIR=G:\DADINI_DATOS\DADINI_SAAS
PORT=5055
```

- `DADINI_DATA_DIR` es el **respaldo automático**: si PostgreSQL no responde, la API sigue funcionando con `G:\DADINI_DATOS\DADINI_SAAS\dadini.json`.
- Cada escritura se guarda de forma transaccional en PostgreSQL.
- `GET /api/health` muestra `motor` y `base` para confirmar dónde está escribiendo.

### Regenerar los datos demo

```bat
cd dadini-saas\backend
npm run seed
```

Vuelve a crear ~130 pedidos, 14 productos, 3 almacenes, 16 clientes, 6 usuarios y 2 rutas con fechas relativas al día actual. **Sobrescribe** solo el esquema `dadini_saas`.

### Respaldo

```bat
pg_dump -h localhost -p 5432 -U postgres -n dadini_saas -Fc DADINI_DB > G:\DADINI_DATOS\Respaldos\DADINI_SAAS\respaldo.dmp
```

También queda una copia JSON de respaldo en `G:\DADINI_DATOS\DADINI_SAAS\dadini.json`.

---

## 4. Módulos incluidos

| Módulo | Funcionalidad |
| --- | --- |
| Dashboard | KPIs del día y del período, evolución de ventas, canales, top de productos, alertas y rutas activas |
| Ventas | Listado de pedidos con filtros, detalle, cambio de estado, pagos y comprobantes |
| Nueva venta (POS) | Catálogo por almacén, carrito, cliente, descuento, envío, forma de pago y descuento de stock |
| Clientes | Cartera, tipos, zonas, cupos de crédito, saldo e historial |
| Cobranzas | Facturas abiertas, vencidas, antigüedad, pagos y registro de cobros |
| Inventario | Productos, stock por almacén, ajustes, transferencias, movimientos y alertas |
| Distribución | Rutas, paradas, repartidores, vehículos, inicio/cierre de ruta y confirmación de entregas |
| Reportes | Ventas por día, productos, clientes, márgenes y exportación CSV |
| Administración | Usuarios y roles, configuración de empresa, tarifas y auditoría |
| Planes | Suscripción SaaS, límites de usuarios y facturación demo |
| Geolocalización | Coordenadas al crear clientes, check-ins en ventas/cobranzas/rutas, mapas y visitas en tiempo real |
| Crédito y mora | Plazo por venta, intereses diarios configurables, sanciones y cobro de intereses antes del capital |
| Preparado de carga | Cierre del día: agrupa unidades por producto, las convierte en cajas, asigna repartidor/vehículo según el vendedor y crea el almacén móvil del camión |

---

## 4b. Geolocalización, crédito y sanciones

### Coordenadas y visitas
- Al crear un cliente desde **Clientes → Nuevo cliente**, el vendedor puede pulsar **“Usar mi ubicación actual”** o escribir latitud/longitud. Se guardan en el cliente y se genera automáticamente una visita `alta_cliente`.
- En **Nueva venta**, **Detalle de pedido**, **Cobranzas** y **Detalle de ruta** se puede capturar la ubicación del check-in.
- Cada visita queda en `dadini_saas.visitas` con tipo (`venta`, `cobranza`, `distribucion`, `alta_cliente`), coordenadas, precisión, pedido, ruta, usuario, notas y fecha.
- Los paneles consultan `/api/visitas` cada 15 s para mostrar las visitas “en tiempo real” y las dibujan sobre mapas Leaflet/OpenStreetMap.
- Endpoints: `GET /api/visitas`, `POST /api/visitas`, `PATCH /api/visitas/:id`, `GET /api/visitas/resumen`, `GET /api/geo/clientes`, `GET /api/geo/cercanos`.

### Plazo de crédito por venta
- En el POS, al elegir **Crédito** aparecen los campos **Plazo del crédito (días)** y **Vencimiento estimado**.
- El pedido guarda `dias_credito` y `fecha_vencimiento`; si no se especifica, usa `configuracion.empresa.dias_credito`.
- Se puede vender al contado (`efectivo`, `qr`, `transferencia`) o a crédito; el stock se descuenta en ambos casos.

### Interés por mora y sanciones
Configurables en **Administración → Configuración → Sanciones e intereses por mora** (o `PUT /api/configuracion`):

| Parámetro | Significado |
| --- | --- |
| `aplicar_interes` | Activa/desactiva el cálculo automático |
| `tasa_interes_mensual` | Tasa mensual aplicada diariamente sobre el saldo vencido (`tasa / 30`) |
| `dias_gracia` | Días posteriores al vencimiento sin cobro de interés |
| `sancion_fija` | Monto fijo que se agrega una sola vez al vencerse |
| `porcentaje_sancion` | Porcentaje adicional único sobre el saldo vencido |

Cálculo: `interés = saldo × (tasa_mensual / 100 / 30) × días_vencidos_después_de_gracia + sanción_fija + saldo × porcentaje_sancion / 100`.

- Cobranzas muestra **Interés**, **Saldo (capital)** y **Total a cobrar** por factura.
- Al registrar un cobro, el monto se imputa **primero a intereses** y luego al capital; el recibo guarda el desglose.

## 4c. Preparado de carga y almacén móvil

En **Ventas → Preparado de carga** (`/ventas/preparado`):

1. Se elige la **fecha**, el **vendedor** y opcionalmente el **almacén**.
2. El sistema toma todos los pedidos pendientes/preparando/enviado de ese cierre y **suma las unidades por producto**.
3. Cada producto indica **unidades por caja** (configurable en Inventario): se calculan cajas completas, unidades sueltas y **cajas a preparar** (una caja parcial cuenta como caja).
4. Se asigna automáticamente el **repartidor y vehículo** según el vendedor (configurable en Administración → Usuarios), y se confirma la carga.
5. Se crea una **carga** (`CAR-…`) y una **ruta** (`RUT-…`) con una parada por pedido. Los pedidos quedan marcados con la carga y pasan a `preparando`.
6. La carga avanza: `preparando → preparada → en_ruta → descargada`. Al pasar a `en_ruta`, la ruta se inicia; para `descargada`, todos los pedidos deben estar entregados.

**Aislamiento del inventario:** las unidades de la carga se registran como **almacén móvil** dentro de `dadini_saas.cargas.lineas`. No se escriben en `dadini_saas.stock`, por lo que:

- el stock del almacén físico **no se recalcula** al preparar, cargar ni descargar el camión;
- los nuevos pedidos que generen los vendedores siguen descontando **solamente del almacén físico**;
- el detalle de carga muestra cuántas unidades/cajas **quedan en el camión** a medida que se entregan pedidos.

Endpoints: `GET /api/cargas`, `GET /api/cargas/preparar`, `POST /api/cargas`, `GET /api/cargas/:id`, `PATCH /api/cargas/:id/estado`.

## 4d. Preventa R1/R2, visitas y entregas

**Rol preventista:** al crear un usuario con rol `preventista` se configuran su **ruta (R1/R2)**, sus **días de visita**, el **repartidor** y el **vehículo** asignados. Los clientes también tienen ruta y día de visita.

- **Ventas → Mi agenda de visitas** (`/ventas/agenda`) muestra solo los clientes que ese preventista debe visitar el día correspondiente (R1 / lunes, martes, miércoles…). Incluye KPIs de asignados, visitados, con pedido, sin pedido y pedidos creados.
- Cada visita se registra con **geolocalización** y resultado: **pedido** o **no pedido** con motivo (`cerrado`, `con_stock`, `sin_dinero`, `otro`).
- Las visitas y los pedidos se actualizan en el mapa cada 15 s. Los clientes del mapa son **solo los asignados** al preventista para ese día.
- Al crear la venta desde la agenda, el pedido queda marcado como `es_preventa`, se programa para **el día siguiente**, se vincula al **distribuidor del vendedor** y se agrega automáticamente a una ruta.
- **Distribución → Pedidos programados** (`/distribucion/programados`) muestra solo los clientes con pedido confirmado del preventista, con filtros de fecha, ruta, forma de pago, estado y distribuidor. El mapa muestra únicamente esos clientes.
- El distribuidor registra cada entrega como:
  - **Entregado completo**
  - **Cerrado / no recibido** (parada fallida y pedido vuelve a preparación)
  - **Parcial** (se descuentan productos del pedido y se recalculan subtotal, total, pagado y saldo)
- Todo queda trazado en `visitas` con `resultado`, `motivo`, `productos_devueltos` y coordenadas.

**Reporte de campo** en Reportes: filtros avanzados por rango de fechas, ruta R1/R2, vendedor, distribuidor, día de visita, resultado, motivo de objeción, forma de pago (contado/crédito), estado y búsqueda. Incluye KPIs de conversión, montos contado/crédito, entregas, parciales y unidades devueltas, más exportación CSV.

Endpoints: `GET /visitas/agenda`, `GET /pedidos/programados`, `GET /campo/reporte`, `GET /campo/export`, `PATCH /rutas/:id/paradas/:pedidoId` con `resultado_entrega` y `productos_devueltos`.

## 4e. Mapas por estado, fichas de acción y trazabilidad total

- Los pines de los mapas de **Ventas (agenda)**, **Distribución (programados)** y **Cobranzas** cambian de color según el estado:
  - verde = visitado / pedido / entregado / pagado
  - naranja = pendiente / preparando / parcial / en camino
  - rojo = sin pedido / cerrado / vencido / fallido
  - azul = enviado, morado = crédito
- Las filas/tarjetas de esos módulos son **botones**: al hacer clic se abre una **segunda tarjeta** de detalle con las acciones del rol:
  - **Preventista:** marcar visitado + motivo, crear pedido y avisar por WhatsApp.
  - **Distribuidor:** entregar, entrega parcial, cerrado y enviar comprobante por WhatsApp.
  - **Cobranzas:** generar cobranza y enviar detalle de pago por WhatsApp.
- WhatsApp se implementa con enlace profundo `wa.me` y queda registrado en `dadini_saas.mensajes_whatsapp` con tipo (`pedido`, `entrega`, `cobranza`), número, mensaje, estado, coordenadas y usuario.
- **Reportes → Reporte de campo** incluye la pestaña de **trazabilidad completa**: cada visita, pedido, entrega, cobro y mensaje queda en una línea con **fecha y hora, tipo, acción, empleado, cliente, pedido, coordenadas y estado de WhatsApp**. Filtros adicionales: tipo de movimiento, solo con WhatsApp y solo con coordenadas. El CSV exportado incluye esas columnas.

Endpoints: `POST /api/whatsapp`, `GET /api/whatsapp`, `PATCH /api/whatsapp/:id/estado`, `GET /api/campo/reporte` (con `movimientos`), `GET /api/campo/export`.

## 4f. Responsable del cobro según mora

- El sistema calcula `en_mora` comparando el vencimiento del pedido con los **días de gracia** configurados.
- **Mientras el crédito está al día**, el responsable del cobro es el **vendedor que generó la venta**. El módulo Cobranzas les aparece como **“Mis créditos”** y pueden registrar pagos, ver el mapa, abrir la ficha del cliente y enviar el detalle por WhatsApp con las mismas funciones del cobrador.
- **Al vencerse**, el pedido se **migra automáticamente al cobrador** (`responsable_cobro_id = cobrador_id`, fecha `migrado_cobranzas_en`). Desde ese momento el vendedor ya no puede cobrarlo y Cobranzas solo muestra cuentas vencidas.
- `GET /api/cobranzas` aplica el filtro según el rol; `POST /api/pedidos/:id/pagos` valida que solo el responsable correspondiente pueda cobrar.
- El reporte de campo incorpora el filtro **Solo en mora / Solo al día** y la trazabilidad conserva siempre el responsable del cobro.

## 4g. Importación masiva y promociones

**Excel (xlsx/xls):** en Inventario y Clientes hay un botón **Importar Excel**, con plantilla descargable y vista previa de filas antes de confirmar.

- Productos: `nombre`, `sku`, `categoria`, `precio`, `costo`, `unidad`, `unidades_por_caja`, `stock_minimo`, `stock_inicial`, `emoji`, `color`. El `stock_inicial` se registra como entrada de inventario.
- Clientes: `nombre`, `codigo`, `tipo`, `zona`, `direccion`, `telefono`, `email`, `contacto`, `limite_credito`, `latitud`, `longitud`, `ruta_venta`, `dia_visita`, `notas`. Si trae coordenadas se genera la visita `alta_cliente`.
- Ambos devuelven cuántas filas se crearon y los errores por fila.
- **Actualizar precios** (menú Catálogo → Actualizar precios): permite editar precio y costo de todos los productos a la vez en la tabla o subiendo un Excel con `sku, nombre, precio, costo`. Botón **Aplicar N cambios** guarda todo y muestra el detalle de cada producto modificado.
- **Sincronizar** (barra superior, ícono circular): guarda la base local, verifica buckets, sube la instantánea a Supabase y la confirma. Muestra porcentaje, etapa actual, aviso de éxito/fallo y los errores exactos.
- **Nombre DADINI / Gestión SaaS** del menú: al hacer clic vuelve al Dashboard.

### Cierre de almacenes y productos inactivos

- En Inventario → **Almacenes**, cada almacén no central tiene **Cerrar almacén**. El cierre mueve **todo** su stock (incluidos productos inactivos) al **Almacén Central**, genera un par de movimientos `transferencia_salida`/`transferencia_entrada` por producto y muestra cuántas unidades se movieron. El almacén queda marcado como **Cerrado** y puede **Reabrirse**. No se puede cerrar el almacén central.
- El modal muestra por separado las unidades **activas** y las **físicas** (incluye inactivos) para que el cierre sea transparente.
- En Inventario → Productos hay un filtro **Solo activos / Solo inactivos / Todos**. Los productos inactivos se ven con badge **Inactivo** y **stock 0**.
- Los productos inactivos **no cuentan** en "Unidades en stock", "Valor del inventario", "Stock bajo", métricas por almacén ni "Capital en almacenes" de Rentabilidad. El stock físico se conserva y se transfiere al cerrar.

### Rutas, zonas y tipos de cliente

- Una ruta de venta permite programar **varios días de visita** y, para **cada día**, **hasta 3 zonas**. En el modal: chips de días, selector de zona + botón **Agregar**, lista de zonas guardadas por día con opción de quitarlas, y chips de **tipos de cliente de la ruta** (ej. Caseta mayorista, Mayorista, Distribuidora). Se guarda en `dias_visita`, `zonas_por_dia` y `tipos_cliente_ids`; `zona`/`zona_id`/`zona_ids` se mantienen por compatibilidad. Los días se agregan a `dias_visita` del vendedor y la agenda de preventa usa las zonas correspondientes al día.
- Al registrar un cliente en una ruta, el selector de tipo de cliente se filtra a los tipos definidos para esa ruta.
- La agenda de preventa usa **todas las zonas** que el vendedor visita ese día, no solo `zona_venta`.
- Los **tipos de cliente** son jerárquicos: se puede elegir un **tipo principal** al crear uno (ej. "Tienda de barrio" → "Tipo A", "Tipo B", "Supermercado"). Antes cualquier nombre se convertía en "Minorista".
- En **Nuevo cliente** el selector de tipo se llena con los tipos creados (incluye subtipos con `↳`). La **zona** se filtra automáticamente a las zonas que el vendedor atiende el día seleccionado (o el día actual si está en automático); si solo hay una, se asigna sola.

### Ocultar inactivos y eliminación

- Por defecto, **todo el sistema oculta** productos, categorías de cliente, categorías/marcas de producto, tipos de cliente, zonas y rutas **desactivados**. Las páginas de administración (`/categorias?todos=true`, `/rutas-venta?todos=true`, `/producto-catalogo?todos=true`) pueden mostrarlos para reactivarlos o borrarlos.
- Acciones de **eliminar** disponibles: categorías de cliente (con validación de clientes/vendedores/promociones/subcategorías), tipos de cliente (clientes/subtipos), zonas (clientes/rutas/vendedores), productos (`DELETE /productos/:id?permanente=true`, bloqueado si hay ventas), además de las ya existentes para categorías/marcas de producto y rutas. Todas usan el diálogo `Confirm` y auditoría.
- En Roles y permisos y en el alta de usuarios, el check **"Mostrar solo funciones activas"** oculta las funciones no asignadas; el menú respeta la misma compatibilidad módulo ↔ subfunción que el backend.

### Asistente AI (OpenAI)

Botón **Asistente AI** en la barra superior. Panel con chat, sugerencias y **alertas proactivas** (cobranzas vencidas, stock bajo, visitas pendientes del día y caída de ventas).

- **Configuración:** añadir `OPENAI_API_KEY` en Render (y opcionalmente `AI_MODEL`, por defecto `gpt-4o-mini`, y `AI_BASE_URL`). La llave **nunca** se envía al frontend. Sin llave, las alertas siguen funcionando y el chat muestra un aviso.
- **Herramientas de lectura:** resumen de ventas, cobranzas vencidas, stock bajo, clientes por zona/día y productos más vendidos.
- **Herramientas de escritura:** crear cliente, actualizar precio y registrar visita. El agente **propone** la acción y el usuario debe pulsar **Confirmar y ejecutar**. Cada ejecución respeta los permisos del usuario y queda en auditoría.
- Límite de 40 consultas por minuto por usuario. Costo estimado con `gpt-4o-mini`: muy bajo para uso normal.

### Geocerca

- **Por zona:** en Rutas y zonas de venta, el lápiz junto a cada zona abre **Geocerca**: activar, latitud/longitud del centro y radio en metros (por defecto 50). Se guarda con `PUT /api/rutas-venta/zonas/:id`.
- **Por usuario:** en Administración → usuarios, cada vendedor tiene **"Exigir geocerca a este usuario"** y **Radio (m)**.
- Al registrar una **venta** o una **cobranza**, el backend calcula la distancia real (Haversine en metros) entre la ubicación del dispositivo y la tienda del cliente. Si supera el radio, responde **403** con la distancia exacta: *"Estás a 12655 m del cliente. El límite permitido es 50 m."* No se descuenta stock ni se crea el pago.
- Si la geocerca está activa y no hay GPS o el cliente no tiene coordenadas, la operación se bloquea con un mensaje claro. Las pantallas de Venta nueva, Cobranzas y Detalle de pedido capturan la ubicación automáticamente antes de enviar.
- Excepciones: administradores/dueños y quienes tengan `geocerca.excepcion_ventas` o `geocerca.excepcion_cobranzas` (permisos nuevos, independientes del módulo Ventas/Cobranzas).
- Se corrigió `esCoordenaValida`: `null`/`''` ya no se cuentan como `(0,0)`, evitando visitas falsas y falsos "dentro de la zona".

### Catálogos, fotos y cambios de preventa

- **Catálogos:** el historial tiene **Renombrar** y **Eliminar**. El nombre se conserva en el prefijo de fecha para no perder el orden. También se puede escribir un **nombre** antes de generar, para diferenciar el catálogo antiguo del actual.
- **Catálogo de promociones:** en Generar catálogo, el selector **Productos / Promociones** crea un PDF con las promociones activas, sus imágenes, vigencia y descripción.
- **Promociones:** el formulario acepta **hasta 2 imágenes** optimizadas; se suben al bucket `comprobantes` y se guarda la URL pública en la promoción. Al eliminar la promoción se borran sus fotos.
- **Devoluciones:** al generar una devolución desde Mi camión se puede adjuntar una **foto de comprobante** (mal estado o cambio solicitado). La miniatura se muestra en el listado de devoluciones.
- **Preventa:** en "Registrar visita" y en la visita desde el mapa existe el motivo **Cambio de producto**, con producto, cantidad, motivo, detalles, **lote**, **fecha de vencimiento** y **foto de comprobante**. Todo queda en la visita (`detalle`, `foto_url`, `cambios[]`) y se muestra en la ficha del cliente.
- Helper reutilizable `backend/src/fotos.js` (bucket `comprobantes`, máximo 2 MB por foto).

### Mapa de zonas (cuadrantes)

Página **Ventas → Mapa de zonas**: se elige una zona y se pulsa **Dibujar cuadrante**; cada clic en el mapa agrega un vértice (mínimo 3, máximo 12) y **Guardar cuadrante** persiste el polígono `zona.geocerca.poligono`. La geocerca de esa zona usa el polígono (point-in-polygon) en lugar del círculo.

- Clientes dentro del cuadrante → marcador **verde**; clientes fuera → marcador **rojo** y aviso rojo con el conteo.
- Panel "Clientes fuera del cuadrante" con selección múltiple y **Reasignar seleccionados**: elige la zona vecina y el vendedor de esa zona; se actualizan `zona`, `zona_id`, `ruta_venta`, `ruta_venta_id`, `vendedor_id`, `distribuidor_id` y `dia_visita`.
- Endpoints: `PUT /api/rutas-venta/zonas/:id/poligono`, `GET /api/geo/zonas/:id/cobertura` y `POST /api/geo/zonas/:id/reasignar-fuera`.
- Sin librerías nuevas: se usa `useMapEvents` + `Polygon` de react-leaflet y ray-casting propio (`puntoDentroPoligono`). `zonas`, `tipos_cliente` y `rutas_venta` se agregaron a `ENTIDADES` para sobrevivir en modo PostgreSQL.
- Los mapas usan tiles de **Esri World Street Map** sin API key, con su atribución visible, en el componente compartido `CapaMapa`. El servidor público de OpenStreetMap bloqueaba con 403 ("App is not following the tile usage policy") y CARTO empezó a exigir clave el 25/09/2026 ("API KEY REQUIRED"); con Esri los tiles cargan correctamente en todos los mapas del sistema.

### PWA offline y firma/POD

- **PWA instalable**: `manifest.webmanifest` + `sw.js` (app shell cacheado, API con network-first y fallback). El service worker se registra en producción y se habilita explícitamente en el WebView de la APK (`ServiceWorkerController`).
- **Cola offline**: `api.js` detecta `navigator.onLine === false` (o fallo de fetch) en POST/PUT/PATCH/DELETE y guarda la operación en `localStorage` (`dadini_cola_offline`). Al volver la red, `reenviarCola()` las envía en orden, quita las exitosas y conserva las fallidas por 5xx/red. Se excluyen login, PIN, perfil, APK y PDFs grandes.
- **Banner de conexión** en el Shell: muestra "Sin conexión · N cambios guardados", progreso del reenvío y botón **Reenviar ahora**. Los callers reciben un mensaje claro en vez de un error críptico.
- **Firma/POD**: componente `FirmaCanvas` (canvas táctil, PNG) disponible en entregas de ruta (flujo detallado y parcial/cerrado), Pedidos programados, "Pasar a entregado" del detalle de pedido y visitas de preventa. El backend sube la firma al bucket `comprobantes` con `subirFoto(..., 'firma')` y guarda `firma_url` en la parada, el pedido (`fecha_entrega`, `entregado_por`) y la visita. La firma se muestra en comprobantes, detalle de pedido y ficha del cliente.

### Caja y facturación SIAT

- **Caja y arqueo** (`/caja`): apertura con saldo inicial, ingresos/egresos (los cobros y ventas al contado se registran solos, abriendo la caja automáticamente si no existía), cierre con saldo declarado y **diferencia**. Historial de cajas por fecha.
- **Facturación SIAT** (`/facturacion`): registro de normativas con **vigencia por fecha** —IVA 13% "por dentro" (efectivo 14,94%), IT 3%, Ley 1733 "por fuera" pendiente de Decreto Supremo, crédito fiscal de combustible 100%, requisitos de comprador/ventas menores/TCO, prescripción 4 años—. El botón **Actualizar normativa SIAT** consulta el feed opcional `SIAT_NORMATIVA_URL` o el registro integrado (`2026.11.25`), fusiona cambios y reporta nuevas/actualizadas/vigentes. Las normas editadas a mano no se sobrescriben.
- Cada venta genera una **factura** con correlativo de dosificación, NIT/razón social, comprador (S/N y NIT 0 hasta Bs 1.000), desglose de IVA e IT según la norma vigente a la fecha, y versión de normativa aplicada. Se puede **ver, descargar PDF y anular**.
- La calculadora de impuestos aplica la normativa vigente a una fecha y monto dados, permitiendo aumentos, reducciones y leyes temporales sin cambiar código.
- **Credenciales listas para cuando las tengas**: panel "Credenciales SIAT / envío XML" con ambiente (piloto/producción), URL del endpoint, modalidad, código del sistema, autorización, NIT/actividad y campos para token, usuario, contraseña, certificado y clave privada. Se guardan con el botón **Guardar credenciales SIAT**; los secretos se cifran AES-256-GCM con `SIAT_SECRET_KEY` (variable configurada en Render) y **nunca se devuelven al frontend** (solo se indica si están cargados). Dejar un secreto vacío conserva el valor anterior.
- **XML y envío**: cada factura tiene **Generar XML** (guarda el Documento Fiscal Digital en el bucket `facturas`) y **Enviar al SIN** (usa las credenciales guardadas y registra estado/respuesta). Sin credenciales o con envío desactivado, responde un mensaje claro. El XML generado es un borrador con los datos obligatorios; debe validarse contra el Anexo Técnico/XSD de la modalidad asignada por el SIN antes de producción.

### Notas de crédito/débito y anulación fuera de plazo

- Desde **Facturación SIAT**, cada factura tiene un botón **Nota** para emitir una **nota de crédito** (reduce el saldo, devoluciones) o de **débito** (aumenta el saldo, cargos adicionales), ligada a la factura y con motivo obligatorio. El correlativo se guarda en la dosificación y el cliente se recalcula automáticamente.
- Cada nota tiene **Generar XML** (Documento Fiscal Digital en `facturas`), **Enviar al SIN** con las credenciales cifradas y **Anular**; el estado y la respuesta quedan registrados.
- Según la **RND 102600000025** (anulación fuera de plazo, hasta el día 9 del mes siguiente), el botón **Fuera de plazo** registra la solicitud con motivo y documento de respaldo; el SIN resuelve en hasta 6 meses. El estado de la solicitud se muestra en la factura.
- Endpoints: `GET /api/fiscal/notas`, `POST /notas`, `/notas/:id/xml`, `/notas/:id/enviar`, `/notas/:id/anular` y `POST /facturas/:id/anular-fuera-plazo`. El detalle de lotes y notas se persiste en `ENTIDADES` para modo PostgreSQL.

### Kardex con lotes y FEFO

- Nueva página **Catálogo → Kardex y lotes** (`/inventario/kardex`). Desde Inventario, el ícono de lista de cada producto abre el kardex filtrado.
- **Entradas con lote y fecha de vencimiento** (también en el ajuste de Inventario); **transferencias** que conservan la identidad del lote.
- **Salida FEFO**: al vender se consumen primero los lotes con vencimiento más próximo; los vencidos quedan excluidos de la venta. Se guarda en cada línea del pedido el lote consumido para que la anulación reingrese exactamente ese lote.
- `db.stock` sigue siendo el agregado oficial; `db.lotes`/`db.kardex` son el detalle. `kardex.sincronizar` reconcilia escrituras antiguas y el stock del camión sin mezclarlo con el almacén físico.
- Panel de **vencidos y próximos a vencer (60 días)** y alerta en el dashboard. Endpoints `GET /api/kardex`, `/producto/:id`, `/alertas`, `POST /entrada` y `/transferencia`.

### Reportes automáticos por WhatsApp

- Nueva página **Análisis → Reportes automáticos** (`/reportes/automatico`). Permite activar un resumen diario, elegir **hora** (HH:MM), frecuencia (**diario** o **lunes a viernes**), destinatarios (empleados con WhatsApp) y qué secciones incluir: ventas del día, cobranzas/vencidas, stock bajo, vencimientos de lotes y visitas.
- La **vista previa** muestra en vivo el mensaje exacto. El botón **Generar ahora** lo prepara de inmediato y el job del servidor (cada minuto) lo prepara solo a la hora configurada, una vez por día.
- No hay WhatsApp Business API: se generan enlaces `wa.me` con el texto prellenado y se deja trazabilidad en `mensajes_whatsapp` (`referencia: "Reporte automático · fecha"`). El panel **Último reporte preparado** permite abrir cada chat o **Abrir todos los chats** (escalón de 250 ms para evitar bloqueo de popups); una persona confirma el envío final.
- La generación de links masivos se centralizó en `whatsapp-links.js`, compartida por `/api/whatsapp/masivo` y el reporte automático. Endpoints: `GET/PUT /api/reportes/automatico`, `POST /vista-previa` y `POST /enviar`.

### CRM 360 + scoring RFM

- Nueva página **Análisis → CRM 360** (`/crm`), también accesible desde **Clientes → CRM 360**. Clasifica cada cliente con **Recencia, Frecuencia y Monetario (1–5)** calculados en memoria a partir de pedidos, visitas, pagos y saldos ya persistidos (sin migraciones).
- **10 segmentos** (Campeones, Leales, Potencial leal, Nuevos, Prometedores, Necesitan atención, Hibernando, En riesgo, Perdidos, Sin actividad), cada uno con una **acción recomendada** y una **prioridad P1–P5** que sube automáticamente si hay facturas vencidas.
- Ranking filtrable por segmento, zona, vendedor, riesgo y búsqueda, ordenable por score/recencia/monto/frecuencia/saldo, con **exportación CSV**. El M se calcula por **quintiles relativos** a la cartera, para que el score se adapte al tamaño real del negocio.
- **Ficha 360** (modal): resistencia RFM, ciclo de compra y próxima visita sugerida, productos favoritos, pestañas de pedidos, visitas (timeline), cobros/pagos y **notas de seguimiento** persistidas en `crm_notas`. Incluye accesos a nueva venta, cobranzas y WhatsApp prellenado para reactivar o cobrar.
- Endpoints: `GET /api/crm/clientes`, `GET /api/crm/clientes/:id`, `GET /api/crm/segmentos`, `POST /api/crm/clientes/:id/notas` y `DELETE /api/crm/notas/:id`. `crm_notas` se agregó a `ENTIDADES` para sobrevivir en PostgreSQL.

### Seguridad: verificación en dos pasos (2FA)

- **Mi cuenta → Seguridad** permite activar TOTP (RFC 6238, SHA-1, 6 dígitos, ventana ±1 periodo). El backend genera el secreto, lo muestra **una sola vez** junto a un enlace `otpauth://` y lo guarda **cifrado AES-256-GCM** con una clave derivada de `JWT_SECRET` con dominio propio (`totp-secretos.js`), independiente de SIAT. El secreto nunca vuelve a devolverse al frontend.
- Al confirmar con un código válido se entregan **8 códigos de recuperación** de un solo uso (guardados como hashes SHA-256). Desde entonces, el login con contraseña o PIN responde `{ requiere_2fa: true, challenge_id }` **sin emitir JWT**; `POST /api/auth/2fa/verificar` valida el TOTP o un código de recuperación y recién entonces firma el mismo JWT de siempre. Los challenges son efímeros (5 min, máximo 5 intentos) y viven en memoria.
- Se puede desactivar con un código válido. Endpoints: `GET /auth/2fa/estado`, `POST /auth/2fa/iniciar`, `/confirmar`, `/desactivar` y `/verificar`. Los de inicio/verificación tienen rate limit de 10/min.

### Auditoría inmutable y calidad

- Cada entrada de `db.auditoria` se **sella con SHA-256** encadenando el hash de la entrada anterior (`prev_hash`). `utils.audit()` sella **antes** de insertar; al recortar a 500 registros se guarda un `genesis_hash` con el último hash eliminado para que la cadena siga siendo verificable. Las entradas históricas se sellan automáticamente al inicializar.
- `GET /api/configuracion/auditoria/verificar` (admin/dueno/supervisor) recalcula toda la cadena y devuelve `{ ok, total, errores, ultimo_hash, verificado_en }`: detecta cualquier **edición o borrado**.
- **CI activo** (`.github/workflows/ci.yml`, con copia en `docs/ci-workflow.yml.example`): en cada push/PR a `main` corre `npm ci`, `node --check` y los tests del backend, y `npm ci` + `npm run build` del frontend. se activó desde la UI de GitHub porque el PAT de publicación no tiene scope `workflow`; la primera ejecución terminó correctamente.
- **Observabilidad**: si se define `SENTRY_DSN`, `frontend/src/telemetria.js` captura errores no controlados y promesas rechazadas y los envía a `/api/telemetria/error`, que los reenvía a Sentry por envelope HTTP sin añadir dependencias. El envelope incluye la clave pública del DSN en `X-Sentry-Auth` y el endpoint responde el `status` real de Sentry. Sin DSN no hace nada; el DSN nunca llega al navegador. En producción la variable ya está configurada en Render y la prueba controlada fue aceptada (HTTP 200).
- **E2E opcional** con Playwright (`frontend/e2e/login.spec.js`): cubre acceso, login correcto y credenciales inválidas. Requiere `npm i -D @playwright/test && npx playwright install chromium`; se ejecuta con `npm run test:e2e` apuntando `E2E_BASE_URL`.

### Multi-sucursal / tenant (datos aislados)

- Nueva página **Sistema → Sucursales** (`/administracion/sucursales`): crear, editar, activar/desactivar sucursales, asignar usuarios y ver métricas por sucursal. Con una sola sucursal el comportamiento es idéntico al anterior.
- Aislamiento mediante **contexto por request** (`AsyncLocalStorage`): `tenant.js` etiqueta cada fila operativa con `sucursal_id`; `db.load()` devuelve una vista filtrada y `db.save()` integra solo las filas de esa sucursal, conservando las demás. Los usuarios, la auditoría y la configuración son globales; cada usuario tiene `sucursal_id`.
- Administradores y dueños pueden cambiar de sucursal con el selector de la barra superior o el botón **Usar** de la tabla (header `X-Sucursal-Id`, guardado en `localStorage`). Los demás usuarios ven solo la suya.
- Los **IDs y correlativos son globales** (`nextId`/`nextCode` consultan la base real), así que no hay colisiones entre sucursales. La auditoría inmutable sigue funcionando: su ancla se actualiza en la base real aunque la escritura ocurra dentro de una sucursal.
- Datos preexistentes se migran suavemente a la sucursal 1 (`Casa Matriz`) al iniciar; una sucursal nueva empieza vacía. `sucursales` se agregó a `ENTIDADES` para persistir en PostgreSQL.
- Endpoints: `GET /api/sucursales`, `GET /mi`, `POST /`, `PUT /:id` y `POST /:id/usuarios`. Las sucursales inactivas no aparecen en el selector.

### Predicción de demanda y reposición

- Nueva página **Compras → Demanda y reposición** (`/compras/demanda`): calcula demanda diaria desde el historial real de pedidos (excluye cancelados y bonificaciones), descuenta lotes vencidos del stock, estima días de cobertura, punto de reorden y fecha de quiebra. Clasifica urgencia (crítica/alta/media/baja) y sugiere proveedor por categoría.
- Parámetros ajustables: días de historial (30), lead time (7 días) y stock de seguridad (3 días), guardados en `configuracion.reposicion`. Botón **Generar solicitud** convierte las sugerencias en una solicitud de compra con el payload que ya acepta el backend.
- **Solicitudes de compra** ahora precarga cantidades desde la predicción (antes usaba solo `mínimo − stock`). Endpoints: `GET /api/demanda/sugerencias`, `/demanda/producto/:id`.

### Optimización de rutas y tracking en vivo

- **Optimizar por distancia** en el detalle de ruta: nearest-neighbor sobre las coordenadas de los clientes, con ETA recalculado por distancia/velocidad y tiempo de servicio por parada. Velocidad, minutos por parada y hora de inicio se configuran en `configuracion.rutas`.
- Cada parada guarda `distancia_km_desde_anterior`, `minutos_estimados` y su `hora_estimada` real. La ruta guarda `iniciada_en`, `cerrada_en`, `optimizada_en` y `ultima_posicion` con un historial `rastreo` (máx. 200 puntos).
- El repartidor puede **Enviar ubicación** desde la ruta; el mapa muestra su marcador en vivo junto a los check-ins y el panel lateral la última posición. Se mantiene el polling de 15 s. Endpoints: `POST /rutas/:id/optimizar`, `GET/PATCH /rutas/:id/tracking`. Se corrigió el filtro de visitas por distribuidor (`distribuidor_id`).

### Agente AI con memoria y pedidos por voz

- **Memoria RAG** (`documentos_rag`, entidad persistida y aislada por sucursal): indexa automáticamente productos, políticas de crédito/cobranza y normativa SIAT vigente, más notas/FAQs escritas por el equipo. La búsqueda usa similitud coseno sobre bolsa de palabras (`normalize`, sin embeddings) y el contexto se inyecta en el prompt del sistema.
- Nuevas herramientas: `buscar_documentos` (lectura) y **`crear_pedido`** (escritura, con confirmación previa): valida cliente, stock FEFO y límite de crédito, calcula precios en servidor y registra `origen_ia: true`. No aplica promociones, factura SIAT ni caja: esos pasos quedan para el flujo comercial habitual.
- **Pedidos por voz**: botón de micrófono en el Asistente IA usando Web Speech API (`es-BO`); la transcripción se envía como texto al mismo `/ia/chat`. Sin audio ni dependencias nuevas. Las peticiones `/ia` no se encolan offline.
- Endpoints de memoria: `GET/POST /api/rag/documentos`, `DELETE /api/rag/documentos/:id`, `POST /api/rag/buscar`.

### Proveedores: categorías reales y eliminación

- El formulario de proveedores ya no usa una lista fija: toma las **categorías activas reales** desde `/api/producto-catalogo`, así aparecen las nuevas y dejan de mostrarse las eliminadas. El backend filtra también las categorías guardadas en proveedores existentes al listar/editar.
- Botón **Eliminar proveedor** (admin/dueno) con confirmación. La baja se bloquea si hay solicitudes u órdenes de compra que lo referencian, para no dejar compras huérfanas.

### OCR de facturas de proveedores

- Botón **Subir factura (OCR)** en Solicitudes de compra: se envía una imagen JPEG/PNG/WebP a `/api/ia/ocr-factura`, que usa visión del mismo modelo configurado (`AI_MODEL`) sin SDK ni dependencias nuevas. Devuelve `{ proveedor, nit, fecha, items[{sku,nombre,cantidad,precio}], total }`.
- La UI muestra la imagen y lo extraído, vincula SKU/nombre contra el catálogo real, resuelve el proveedor por NIT/nombre y abre el formulario de solicitud con los datos listos para corregir. Nada se guarda sin confirmación.
- Requiere `OPENAI_API_KEY` con créditos; si el modelo no tiene visión, el endpoint responde un error claro.

### BI embebido por rol

- Nueva página **Tablero por rol** (`/bi`) disponible para todos los roles autenticados. Adapta KPIs, gráficos y alertas según `user.rol`: **dueño/admin** (rentabilidad, capital, ranking de vendedores), **supervisor** (equipo, visitas, rutas), **vendedor** (mis ventas, agenda, mis créditos) y **cobrador** (cartera por antigüedad, deudores, cobros y caja). Almacén/distribución ven el tablero operativo.
- Reutiliza `/dashboard`, `/reportes`, `/rentabilidad`, `/visitas`, `/rutas`, `/pedidos`, `/cobranzas` y `/caja`; la normalización para `AreaChart`, `Bars` y `Donut` se hace en adaptadores, sin duplicar endpoints.
- Nota de seguridad: los endpoints agregados siguen siendo globales en backend; el tablero filtra la **presentación** por rol, no los datos. Para aislar cifras entre vendedores haría falta añadir filtros por `vendedor_id` en el backend (no implementado en este cambio).

### API pública y webhooks

- **API keys** con prefijo `ddsk_live_`, estado y scopes (`catalogo:read`, `clientes:read`, `ventas:read`, `ventas:write`, `facturas:read`, `reportes:read`, `integraciones:write`). El token plano se muestra **una sola vez**; en BD solo queda el hash SHA-256. Endpoints de administración: `GET/POST /api/integraciones/api-keys`, `DELETE /:id`.
- **API pública** `/api/public/v1/*` con `X-API-Key`, rate limit propio por key (120/min configurable con `API_PUBLIC_RATE_LIMIT`) y contexto de sucursal. Expone `health, productos, clientes, pedidos, facturas, dashboard, reportes` y `POST /pedidos`. Las respuestas van en `{ ok, fecha, data }` y nunca incluyen secretos.
- **Webhooks salientes** con eventos `pedido.creado`, `factura.emitida`, `cobro.registrado` (y más). Firma HMAC SHA-256 en `X-DADINI-Signature` con `X-DADINI-Entrega` para idempotencia, reintentos con backoff hasta 5 intentos y registro de cada entrega. Configuración en `GET/POST /api/integraciones/webhooks`; el worker corre cada 5 s. El secreto se cifra con la misma clave maestra que SIAT.
- Recepción de eventos externos: `POST /api/public/v1/webhooks/entrantes/:proveedor` registra el payload para revisión. Reutiliza `whatsapp-links.js` para notificaciones `wa.me` (no hay Business API).

### Notificaciones push en la APK

- El backend expone `GET /api/notificaciones/pendientes?desde_id=` y `POST /leer/:id`; el Shell consulta cada minuto, guarda el último id en `localStorage` y llama a `window.DadiniBridge.notificar(...)` cuando la app es la APK.
- `MainActivity.java` crea el canal `dadini_avisos`, expone el bridge `DadiniBridge` con un `NotificationManager` del framework y whitelistea la URL antes de abrirla. Permiso `POST_NOTIFICATIONS` para Android 13+. **Sin FCM ni dependencias nuevas**: funciona con la app abierta/en segundo plano; el push con la app cerrada exigiría migrar el build a Gradle + FCM.
- Versión de la APK subida a **21.0.6** (`versionCode 7`) en `AndroidManifest.xml`, `build-dadini-apk.ps1` y `backend/src/apk.js`. Para generar el binario: `$env:DADINI_APK_PASSWORD=...; .\android\build-dadini-apk.ps1`.

### Migración a Postgres como fuente principal

- `store.js` acepta `DATABASE_URL` (recomendado en Render/Supabase) además de `DB_HOST/DB_*`. Con `DB_SSL=true` (default) se conecta con TLS `rejectUnauthorized:false`; para local usa `DB_SSL=false`.
- Script de migración única: `DATABASE_URL=postgres://... npm run migrar:pg` lee `DADINI_DATA_DIR/dadini.json` y escribe todas las entidades en Postgres sin borrar el JSON original. Las tablas se crean automáticamente en el esquema `dadini_saas`.
- Supabase sigue haciendo de réplica/backup: el snapshot JSON se sube a la tabla configurada en `SUPABASE_SYNC_TABLE`. Antes de activar `DATABASE_URL` en Render, ejecuta la migración con los datos actuales; de lo contrario el sistema arrancaría con el seed vacío.
- **Activado en producción**: `DATABASE_URL` apunta al session pooler IPv4 de Supabase, `DB_SSL=true`, y los datos se migraron desde la instantánea remota. `/api/health` muestra `"motor": "postgres"`. Supabase mantiene además la tabla de snapshots como respaldo.

### Quick wins de interfaz

- **⌘K / Ctrl+K** enfoca la búsqueda global desde cualquier pantalla, con `Esc` para cerrar y atajo visible en el buscador.
- **Modo oscuro** con toggle en la barra superior, persistido en `localStorage` y aplicado antes del primer render (sin parpadeo).
- **Onboarding guiado** de 5 pasos al primer ingreso (demanda, BI por rol, CRM, sucursales y asistente), omitible y recordado. Los módulos nuevos incluyen tooltips en sus acciones principales.
- **Exportar a Excel** desde cualquier listado principal (clientes, productos, pedidos, cartera y proveedores) con `xlsx` cargado de forma diferida; se descarga `.xlsx` con columnas ya normalizadas.
- **Ver cliente 360°** desde el detalle de cualquier pedido: abre el CRM centrado en ese cliente con su RFM, historial y notas.

**Promociones** en Inventario → Promociones:
- **Volumen:** escalas por cantidad con descuento porcentual o fijo.
- **Bonificación:** por cada N unidades, llevar M productos gratis.
- **2x1 / NxM:** paga X y lleva Y gratis.
- **Mixta:** combina varios productos requeridos con descuento y/o bonificación.
- Se configuran vigencia, prioridad, productos/categorías participantes y activación.

El POS reevalúa las promociones en tiempo real mientras se arma el carrito, muestra las reglas aplicadas y las bonificaciones, y **recalcula el stock incluyendo las unidades gratis antes de confirmar**, evitando negativos. El servidor vuelve a evaluar la promoción al registrar el pedido, descuenta el stock de productos y bonificaciones y guarda el desglose en el pedido.

Endpoints: `POST /api/productos/importar`, `POST /api/clientes/importar`, `GET/POST /api/promociones`, `PUT /api/promociones/:id`, `PATCH /api/promociones/:id/estado`, `DELETE /api/promociones/:id`, `POST /api/promociones/evaluar`.

## 4h. Categorías de cliente, rutas asignadas y venta directa

**Categorías configurables** en Clientes → Categorías:
- Cada categoría define **descuento porcentual**, **descuento fijo** y **precios especiales por producto**.
- Al crear un usuario vendedor, el administrador le asigna **categoría de cliente**, **ruta/zona**, repartidor y vehículo. Los clientes que ese vendedor registre heredan automáticamente su categoría, ruta y zona.
- El POS aplica el precio de la categoría del cliente (precio especial o descuento) antes de las promociones.

**Rutas y zonas:** los vendedores y distribuidores solo ven los clientes de su ruta/zona asignada (`GET /clientes?solo_mios=true`, `/pedidos/programados?distribuidor_id=…`).

**Almacenes móviles para venta directa** en Inventario → Almacenes móviles:
- Se carga un camión con productos del almacén físico; esa salida se registra en movimientos, pero el stock cargado pasa a vivir en `dadini_saas.almacenes_moviles.lineas`.
- El vendedor con venta directa ve **solo el inventario cargado** en su camión. Cada venta descuenta de ese almacén móvil (productos y bonificaciones) **sin tocar el stock del almacén**.
- Las promociones también aplican en venta directa y el servidor revalida todo antes de confirmar.

**Promociones por categoría:** cada promoción tiene `categorias_clientes`; vacío aplica a todos. Los productos también pueden restringirse a ciertas categorías (`categorias_clientes` en el producto). Así, mayoristas y tiendas de barrio pueden tener reglas distintas.

**Reportes** incorporan filtros por categoría de cliente y tipo de venta (directa/almacén), manteniendo la trazabilidad completa.

Endpoints: `GET/POST/PUT /api/categorias`, `GET/POST /api/almacenes-moviles`, `POST /api/almacenes-moviles/:id/cargar`, `GET /api/almacenes-moviles/mio`.

## 4i. Bloqueos, dueño del sistema y reasignaciones

- **Bloqueo por deuda:** el administrador/dueño puede bloquear usuarios o clientes desde Administración o desde la ficha del cliente. Si `configuracion.cobranza.bloquear_clientes_con_mora` está activo, los clientes con facturas vencidas se bloquean automáticamente y no pueden recibir nuevas ventas (sí cobros y entregas).
- **Panel del dueño** (`/dueno`): rol `dueno` con acceso total a todos los módulos. Permite configurar **planes y precios** (mensual/anual, límites, características), crear **descuentos globales**, activar reglas de bloqueo y crear nuevos usuarios dueño. Usuario demo: `dueno@dadini.bo` / `Dadini2026!`.
- **Reasignación:** desde la ficha del cliente se cambia vendedor, ruta y zona, y se pueden migrar sus pedidos pendientes/cobranzas al día al nuevo responsable.
- **Fichas de cliente como botones:** al hacer clic se abre una tarjeta de acciones según el rol: visitar (con motivo y coordenadas), crear venta, ver entregas y generar cobranza. El administrador y el dueño ven **todos los clientes** y pueden ejecutar todas las acciones.

## 4j. Mapas accionables, rol camión y devoluciones

- En **Ventas → Iniciar ruta** se abre el mapa de la agenda con **todos los clientes asignados al vendedor y a su zona para el día seleccionado**. El administrador puede elegir el vendedor en el filtro y ver las cantidades por día (lunes, martes, miércoles…).
- Los **pines del mapa** de Ventas, Distribución y Cobranzas son interactivos: al hacer clic aparece un pequeño botón (**Registrar visita / Registrar entrega / Registrar cobranza**) que abre una **segunda tarjeta** con las opciones del rol. En Ventas, “Registrar pedido” lleva al POS con el cliente preseleccionado y, al confirmar la venta, regresa automáticamente al mapa de ruta para continuar el recorrido.
- Nuevo rol **`vendedor_camion`** (`camion@dadini.bo`): opera solo sobre su almacén móvil, solicita producto desde **Mi camión**, el almacén aprueba la carga en **Almacenes móviles → Solicitudes**, y vende con las promociones/precios de la categoría asignada.
- **Ventas** muestra las **rutas asignadas a los vendedores** (ruta, zona, categoría, camión) y permite generar pedidos para cualquiera de ellos.
- **Devoluciones de almacenes móviles** (`/inventario/devoluciones`):
  - Las entregas parciales o cerradas generan automáticamente una devolución pendiente.
  - El encargado de almacén **verifica** el estado (bueno/dañado) y **reingresa** las unidades buenas al stock en tiempo real.
  - El distribuidor puede **reacomodar** esos productos a otro cliente; se registra como venta con `es_reacomodo`, queda grabado en la trazabilidad y reduce lo que debe volver al almacén.
  - Reporte diario con filtros por estado, tipo, fecha, rango, y filtro “Solo reacomodados”.

## 4k. Avance de ruta y objetivos mensuales

- El botón **Avance de ruta** en la agenda muestra la lista de clientes con estado (verde = pedido, rojo = sin pedido, naranja = pendiente, gris = **sin compra en el mes**) y el informe inferior: total de clientes, cuántos realizaron pedido, cuántos no, visitas y compras del mes.
- El informe muestra el detalle mensual por cliente (por ejemplo, 4 visitas semanales → cuántas generaron pedido) y el color gris para quienes no compraron en todo el mes.
- Con **Ventas → Generar objetivos** (administrador/supervisor) se crean metas por **monto general**, **producto específico** o **volumen de producto**, con mes, vendedor/ruta y días laborables.
- El avance calcula en tiempo real: meta mensual, meta diaria, ventas del mes y del día, progreso, falta diaria, clientes del día, cuántos ya compraron y **cuánto debe venderse a cada cliente pendiente** (si 2 de 20 no compraron, se divide entre 18; si uno ya compró Bs 1.000, se descuenta de la meta diaria).
- Los datos se reflejan en el mapa y en el reporte de campo.

## 4l. Lista de distribución, carga combinada y confirmación doble

- En **Reportes → Lista de clientes para distribuir** el encargado de almacén filtra por distribuidor, ruta, fecha y almacén. La tabla muestra cliente, monto del pedido, vendedor, número de pedido, código del distribuidor, cajas, unidades, **peso en KG** y resumen de productos; abajo están los totales de pedidos, monto, cajas y peso. Exportable a CSV.
- El **Preparado de carga** pasó a **Inventario** (`/inventario/preparado`) y muestra las unidades unificadas convertidas a cajas con el total de monto al pie.
- **Objetivos combinables:** se pueden crear varias metas para el mismo mes/vendedor (monto general + producto + volumen). El avance suma los montos y respeta cada objetivo de producto por separado.
- **Confirmación de carga en dos pasos:** el almacén confirma la carga y registra novedades (dañado, corta fecha, faltante). El distribuidor recibe una notificación en su app, revisa las novedades y confirma la recepción con sus propias observaciones. Ambos respaldos quedan con fecha y hora.

## 4m. Entrega detallada desde el mapa de ruta

- Al ingresar a **Distribución** aparece **Iniciar ruta**, que abre el mapa geolocalizado en tiempo real de la ruta activa.
- Cada pin lleva un botón **Realizar entrega** que abre una segunda pantalla con el detalle del pedido.
- En esa ficha se puede **aumentar** un producto (tomando unidades reacomodadas de visitas anteriores), **disminuir** o **eliminar** productos que el cliente no quiere recibir, reduciendo devoluciones al almacén.
- Abajo están los botones **Confirmar entrega** y **Rechazar entrega**:
  - Confirmar abre el comprobante (**nota de entrega o factura**), con opción de **compartir por WhatsApp** e **imprimir**.
  - Rechazar permite elegir **cerrado, no tiene dinero, no hizo pedido, no se encuentra el encargado u otros**, con detalle libre para “otros”.
- El botón **Agregar producto** muestra el inventario real del camión (productos de clientes que rechazaron), permite sumarlos al pedido actual y **bloquea aumentos por encima del stock disponible** fuera de lo comprometido. El servidor revalida el límite antes de confirmar, evitando consumir stock inexistente.
- Todo queda registrado con fecha, hora, coordenadas y motivo en la trazabilidad.

## 4m. Alta de cliente → venta desde el mapa

Al crear un cliente, el sistema muestra una tarjeta de confirmación con el botón **Crear pedido desde el mapa de ruta**. Al pulsarlo se abre la agenda geolocalizada con ese cliente seleccionado y su ficha de visita, desde la cual se elige **Registrar pedido** (POS con retorno automático al mapa) o **Registrar no compra** con motivo y coordenadas.

## 4n. Marca, APK, nube y producción

- **Administración → Marca y APK** (solo admin/dueno): configura logo, colores, tipografía, radio y fondo; los cambios se aplican en toda la app mediante variables CSS (`BrandStyle`).
- Permite **subir la APK** (.apk, hasta 200 MB), ver versión/tamaño, descargarla y **compartirla por WhatsApp** con un enlace público servido en `/uploads/apk`.
- **Supabase gratuito**: configurable con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. El sistema mantiene el archivo/disco G: como fuente principal y envía un snapshot completo por empresa a la tabla `saas_snapshots` cada 15 s (o manualmente), con estado en pantalla. El SQL de creación está en la propia pantalla.
- **Seguridad**: Helmet, rate limiting, JWT configurables por entorno, CORS controlado y validación de configuración al arrancar.
- Revisión senior y plan de optimización en `docs/CODE_REVIEW.md`.

Para producción: definir `JWT_SECRET`, `CORS_ORIGIN`, credenciales Supabase, servir detrás de HTTPS y programar respaldos de G:.

### Producción desplegada

- **URL pública:** https://dadini-saas.onrender.com
- Repositorio: https://github.com/Elvisdadini/dadini-saas
- Render Web Service (plan Free, región Oregon) sirve frontend compilado + API Express en el mismo proceso.
- Build Command: `npm install && npm --prefix backend install && npm --prefix frontend install --include=dev && npm --prefix frontend run build`
- Start Command: `npm start`
- Variables de entorno configuradas: `NODE_ENV`, `JWT_SECRET`, `CORS_ORIGIN`, `DADINI_DATA_DIR`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- En Render el motor local es JSON (no hay PostgreSQL local) y la réplica Supabase mantiene los datos fuera del contenedor.

### Estado operativo final

- **Acceso corporativo:** la pantalla de login ya no muestra cuentas de demostración ni credenciales precargadas; los usuarios siguen activos en el sistema pero no aparecen en el inicio.
- **Datos en cero:** ventas, cobranzas, distribución, clientes y datos derivados se reiniciaron para empezar con operación real. Usuarios, productos, stock, almacenes, proveedores y configuración se conservan.
- **APK publicada:** `DADINI-Preventa-20.0.0.apk` (v20.0.0) se sirve desde `/uploads/apk/` y se registra automáticamente si no hay una cargada. Desde **Marca y APK** se puede descargar o compartir por WhatsApp.
- Para regenerar una base limpia: `npm --prefix backend run preparar:produccion` (usa `--demo` en `npm run seed` si se necesita nuevamente la base de demostración).

### Rutas, zonas y permisos

- **Ventas → Rutas y zonas de venta** (`/ventas/rutas`): crea rutas con zona, día de visita y vendedor; el distribuidor se hereda automáticamente del repartidor asignado a ese usuario al crear su cuenta.
- **Clientes** (`/clientes`): al registrar un cliente se crean/asignan automáticamente ruta, zona, tipo de cliente, categoría y distribuidor según lo ya registrado. Incluye asignación masiva de clientes a vendedores.
- **Administración → Roles y permisos** (`/administracion/permisos`): seis modelos listos (Vendedor, Distribuidor, Encargado de almacén, Supervisor, Ventas directa y Cobranzas) y activación de funciones una por uno por usuario.
- Los permisos se guardan en cada usuario y se entregan en `/api/auth/me`, por lo que aparecen o desaparecen al cerrar sesión y volver a ingresar. Administración y dueño tienen siempre todas las funciones.
- Acciones sensibles protegidas: editar/cancelar pedidos requiere `pedidos_editar`; crear/editar clientes requiere `clientes_crear`/`clientes_editar`; eliminar rutas requiere `rutas_eliminar`.

### Subcategorías, camión y WhatsApp masivo

- **Clientes en categorías** y **Inventario en categorías y marcas** aceptan una **categoría/marca padre**: ej. *Tienda de barrio → Tienda A, Tienda B, Supermercado, Minimercado*. Los selectores de clientes y productos muestran la jerarquía con `↳`.
- Al crear un **usuario distribuidor** se le asigna automáticamente un camión disponible; al asignar un repartidor a otro usuario (o al preparar una carga) se hereda el vehículo de ese distribuidor.
- Los usuarios tienen campo **WhatsApp**. Los botones *Enviar por WhatsApp* de catálogos, APK, boletas de sueldo y reportes abren un selector con **la lista de empleados** para elegir uno o varios destinatarios; se generan los links `wa.me` y se registra cada envío en la trazabilidad.

### Permisos detallados y catálogo PDF

- **Administración → Roles y permisos:** 7 grupos (Operación, Logística, Gestión, Catálogo, Inventario, Análisis y Sistema) con **Ver / Crear / Editar / Eliminar** por módulo y sub-funciones específicas (registrar pedidos, cobranzas, entregas, objetivos propios, comprobantes enviados, reportes diarios, etc.).
- Marcado en cascada por módulo y por grupo; 6 modelos de acceso aplicables a cada usuario.
- Compatibilidad con permisos anteriores: un permiso de módulo sigue otorgando sus funciones detalladas.
- **Cobranzas → Mis cobranzas:** lista de cobros realizados por el usuario; el nombre del cliente abre el comprobante enviado por WhatsApp.
- **Catálogo → Generar catálogo:** PDF tamaño **carta**, ligero (imágenes JPEG comprimidas), **16 productos por hoja con imágenes** o 35 sin imágenes. Opciones independientes: con/sin imágenes, con/sin nombres, con/sin precios y con/sin detalles (peso, unidades por caja, presentación). Se guarda en Supabase Storage y se puede visualizar, descargar o compartir por WhatsApp.

### Imágenes de productos

- Las fotos **no se guardan en base64 dentro del JSON** (500 imágenes generarían ~66 MB y harían lenta cada sincronización).
- Se suben al bucket público `productos` de **Supabase Storage** y en el producto solo se guarda `imagen_url`.
- El navegador optimiza cada imagen a **WebP 800 px / calidad 0.8 (30–60 KB, máx. 200 KB)** antes de subirla.
- Carga individual desde el formulario de producto y **carga masiva** desde `Inventario → Cargar imágenes` (archivos nombrados por SKU, ej. `DAD-001.webp`, en lotes de 40).
- El POS muestra las imágenes con **carga diferida** (`loading="lazy"`), con emoji de respaldo si no hay foto.
- Límite: 200 KB por imagen; 500 imágenes a 50 KB ≈ 25 MB (dentro del plan gratuito de Supabase).

### Punto de venta y QR de pago

- **Venta desde mostrador u oficina:** catálogo visual por imagen del producto, botón **Escanear producto** (código de barras, SKU o nombre) con la cámara del teléfono y registro rápido al carrito.
- **Comprobante por WhatsApp:** se ingresa el número al crear la venta, se guarda en el pedido y en el cliente, y al finalizar aparece un modal con **Enviar comprobante por WhatsApp** (detalle de productos y total).
- **Pago con QR:** al elegir `QR simple` se muestra el QR vigente para el cliente.
- **QR de pago en Administración → QR de pago:** imagen, nombre, titular y fecha de vencimiento. Se generan notificaciones y avisos automáticos **2 semanas antes** del vencimiento (o si ya venció) para solicitar el cambio.

### Conteo de inventario

- **Inventario → Conteo de inventario:** conteos semanales o mensuales del inventario general (o por almacén).
- Al iniciar se piden **dos responsables** y se **congela** el stock: se guarda una instantánea que no cambia aunque se sigan registrando pedidos.
- Captura rápida por **código de barras/QR con la cámara del teléfono** (BarcodeDetector nativo de Android WebView) o escribiendo SKU/código/nombre.
- Comparativa en pantalla: sistema congelado vs. físico contado, diferencia, estado y progreso.
- Vista independiente de **congelamiento** y **historial** de conteos.
- Al finalizar se puede **ajustar el stock** a lo contado, generando movimientos y auditoría.
- La APK 21.0.5 otorga el permiso de cámara al WebView para el escáner.

### Manifiesto de preparación de carga

- **Inventario → Preparado de carga → Manifiesto para imprimir:** genera un manifiesto imprimible con:
  1. Lista consolidada de productos a preparar (unidades, uds./caja, cajas, sueltas y casilla de marcado).
  2. Carga agrupada por distribuidor, con sus vendedores asignados, productos, pedidos y clientes.
  3. Lista de clientes con pedidos confirmados incluyendo vendedor, cantidades y total por cliente.
- Totales generales: pedidos, clientes, distribuidores, vendedores, unidades, cajas, peso y monto total de la carga.
- Endpoint: `GET /api/cargas/manifiesto?fecha=&distribuidor_id=&estado=`.
- **Dos impresiones independientes:** *Imprimir productos* (unidades, cajas, sueltas, peso por unidad, peso total por producto y peso total de la carga) e *Imprimir clientes* (clientes, vendedor que hizo el pedido, total del pedido y totales generales en monto y cantidad de pedidos).
- **Asignación automática de distribuidor:** al crear un usuario vendedor se asigna el distribuidor activo con menos vendedores; se puede modificar después desde Administración.
- **Ventas de oficina o clientes sin vendedor:** se pueden asignar manualmente a un distribuidor desde el manifiesto (`PATCH /api/pedidos/:id/asignar-distribuidor`), y también se hereda el distribuidor del cliente al crear la preventa.

### Inventario, bloqueos y comprobantes

- **Inventario → Categorías y marcas:** altas, bajas y asignación de categorías y marcas de producto. El formulario de producto usa catálogos en lugar de texto libre.
- **Bloqueos:** administración puede bloquear usuarios (impide ingreso y actividades) y clientes (impide nuevas ventas y visitas, permite cobranzas), registrando motivo y fecha.
- **Comprobantes:** los pagos a proveedores requieren tipo y número de comprobante/factura. Los cobros con cuenta o método distinto de efectivo requieren número de comprobante.
- **WhatsApp de cobranza:** al registrar un cobro se puede enviar el comprobante al número de WhatsApp registrado en el cliente; el mensaje incluye el número de comprobante y queda en la trazabilidad.

### Continuidad y respaldos

- **Ping automático:** `.github/workflows/keep-alive.yml` consulta `/api/health` cada 10 minutos para que Render Free no duerma y la APK abra rápido.
- **Restauración automática:** al iniciar, si la base local está vacía (por un redeploy de Render), se recupera la última instantánea de Supabase. Se puede desactivar con `DADINI_RESTORE=false`.
- **Restauración manual:** `POST /api/sincronizacion/restaurar` (admin/dueño) trae la instantánea; envía `{ "forzar": true }` para sobrescribir datos locales.
- Supabase sigue recibiendo snapshots cada 15 segundos; los datos también se pueden sincronizar desde **Marca y APK**.

### Acceso y licencia

- **Sin módulo de plan ni facturación:** el sistema es libre para DADINI SaaS, con todos los módulos operativos y sin límites de usuarios.
- **Login por usuario:** se ingresa con un nombre de usuario (ej. `admin`), no con correo. El correo sigue aceptándose por compatibilidad.
- **Usuarios nuevos:** se crean con usuario propio y PIN opcional de 4 a 8 dígitos; si no se escribe usuario, se genera automáticamente desde el nombre.
- **Mantener usuario:** opción en el login para recordar el usuario en el dispositivo; en el próximo acceso solo se pide contraseña o PIN.

### APK DADINI SaaS v21

- **APK actual:** `DADINI-SaaS-21.0.5.apk` (carga optimizada y permisos de cámara, ubicación, contactos y galería), independiente de la APK de preventa anterior (que se conserva intacta).
- Muestra el SaaS publicado dentro de un WebView seguro: misma interfaz, módulos, roles y permisos.
- Incluye el logo DADINI sin marca de agua como ícono y en la pantalla de inicio; el mismo logo aparece en miniatura en la web.
- Código de la app y script de compilación en `android/`; llave de firma en `android/dadini-app/signing/` (no versionada).
- Se publica automáticamente como APK por defecto y está disponible en **Marca y APK** para descargar o compartir por WhatsApp.

### Entorno migrado
- Proyecto Supabase: **DADINI Producción** (plan Free, región `us-west-2`), tabla `saas_snapshots` creada con RLS y grant a `service_role`.
- Snapshot verificado: `empresa_id = dadini-principal`, payload con la empresa DADINI y todos los módulos.
- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` quedan configurados solo en `backend/.env` (no versionar).
- InfinityFree no ejecuta Node.js: allí solo se puede publicar el frontend estático; la API debe permanecer en un entorno Node (local/servidor/Contenedor). No se sobrescribió el sitio PHP existente sin autorización explícita.

## 4o. Compras, gastos y rentabilidad

- **Solicitudes de compra**: el almacenero arma la reposición desde productos con stock bajo; el administrador aprueba cantidades y proveedor, generando una **orden de compra**.
- **Recepción**: al recibir la orden, el stock se actualiza automáticamente en tiempo real y se registra el movimiento de inventario con código de orden.
- **Órdenes y pagos**: control de totales, pagado y saldo por orden; pagos a proveedores registrados.
- **Proveedores configurables**: NIT, contacto, categorías que surten, días de entrega y condiciones de pago.
- **Gastos**: tipos configurables (categoría, comprobante obligatorio), registro con comprobante, proveedor, responsable y monto.
- **Reportes / Rentabilidad**: dashboard interactivo por día, semana o mes con ventas, costo, margen, gastos, compras, pagos, deuda con proveedores, utilidad neta, porcentaje de rentabilidad, desglose de gastos por categoría, compras por proveedor y exportación CSV.

## 4p. Reposición editable, planilla y presentaciones de venta

- Las solicitudes de compra se pueden **editar y ampliar con más productos** mientras estén pendientes; una vez **aprobadas quedan bloqueadas** para cualquier modificación.
- La **planilla mensual** genera boletas automáticas con sueldo base, antigüedad, comisión por ventas, comisión por entregas, bonos, descuentos y **conceptos adicionales propios por empleado** (bonos por antigüedad, función, productividad, etc.). Todo se configura en **Compras → Sueldos y boletas → Configurar**, de forma independiente por usuario. Cada boleta se puede **imprimir o enviar por WhatsApp**.
- Los productos registran **unidades por caja y por paquete/display**, y permiten vender por unidad, caja o paquete calculando automáticamente el precio y el consumo de stock.
- El formulario de producto muestra en vivo el **margen de ganancia (%) y por unidad**, base para promociones, comisiones y bonos.
- El dashboard de rentabilidad muestra con claridad el **capital inmovilizado en almacenes y camiones** y la **ganancia neta después de todos los gastos**.

## 5. Arquitectura

```text
dadini-saas/
├─ backend/
│  ├─ src/
│  │  ├─ server.js          # Express, CORS, montaje de rutas
│  │  ├─ db.js              # Carga/persistencia JSON y ruta configurable
│  │  ├─ seed.js            # Generador de datos demo
│  │  ├─ services.js        # Dashboard, reportes y resúmenes
│  │  ├─ auth.js            # JWT y permisos
│  │  └─ routes/            # auth, dashboard, productos, clientes, pedidos, rutas...
│  ├─ data/                 # Respaldo local (fallback)
│  └─ .env                  # Ruta de datos en G:
├─ frontend/
│  ├─ src/
│  │  ├─ App.jsx            # Rutas protegidas y permisos por módulo
│  │  ├─ components/Shell.jsx
│  │  ├─ pages/             # Dashboard, POS, Ventas, Clientes, Cobranzas...
│  │  ├─ charts.jsx         # Gráficos SVG propios
│  │  └─ styles.css         # Sistema de diseño responsive
│  └─ vite.config.js        # Puerto 5180 y proxy /api → 5055
├─ INICIAR_DADINI.bat
└─ README.md
```

**Backend:** Node.js + Express, autenticación JWT, control de permisos por rol y persistencia JSON.
**Frontend:** React 18 + Vite + React Router, CSS propio y gráficos SVG sin dependencias de charting.

---

## 6. Scripts útiles

| Comando | Dónde | Qué hace |
| --- | --- | --- |
| `npm start` | `backend` | API en http://localhost:5055 |
| `npm run dev` | `backend` | API con recarga automática |
| `npm run seed` | `backend` | Regenera datos demo |
| `npm run dev` | `frontend` | Web en http://localhost:5180 |
| `npm run build` | `frontend` | Build de producción en `dist/` |

---

## 7. Notas

- Los datos son **demostrativos** y se regeneran con `npm run seed`; no representan ventas reales.
- El panel real de DADINI está protegido por login y no fue modificado. Esta aplicación es una implementación independiente.
- Para producción se recomienda cambiar `JWT_SECRET`, servir el build de `frontend/dist` detrás de un servidor web y respaldar `dadini.json` de forma programada.
