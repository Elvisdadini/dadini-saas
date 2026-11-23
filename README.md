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
- La APK 21.0.4 otorga el permiso de cámara al WebView para el escáner.

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

- **APK actual:** `DADINI-SaaS-21.0.3.apk` (carga optimizada y permisos de cámara, ubicación, contactos y galería), independiente de la APK de preventa anterior (que se conserva intacta).
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
