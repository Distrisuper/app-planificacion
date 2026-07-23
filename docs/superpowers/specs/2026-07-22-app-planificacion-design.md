# app-planificacion — Diseño (v1 / MVP)

Fecha: 2026-07-22 (revisado tras descubrir el sistema Mobiliza existente)
Estado: Aprobado para pasar a plan de implementación

## 1. Contexto

Hoy el vendedor no tiene una pantalla mobile pensada para ejecutar su ruta diaria: ver qué
clientes tiene que visitar esta semana, entrar a la propuesta comercial de cada uno, y dejar
registrado el resultado de la visita (objeción, reagendado, no visita). La idea nace de
`Brainstorming.md` y ya existe un prototipo visual (`Prototipo/`) que valida gran parte de la
interacción.

**Hallazgo clave durante el diseño:** ya existe un sistema de registro de visitas en producción —
el botón "Visitas" dentro de **Lupa** (`lupa.disturisuper.com`, el e-commerce/catálogo de
DistriSuper), respaldado por **api-mobiliza** (`distrisuper/mobiliza/api-mobiliza`) y su dashboard
de efectividad **app-mobiliza** (`distrisuper/mobiliza/app-mobiliza`, Firebase project
`appvendedores-3e943`). Este sistema:

- Ya captura `visita_id`, `fecha_inicio`/`fecha_fin`, coordenadas de inicio/fin/cliente, y tiene un
  catálogo de motivos (tabla `Motivos`) con relación many-to-many a la visita (`Motivos_visitas`).
- **api-mobiliza y api-node-lupa se van a deprecar** — por eso se está planteando esta app nueva.
- Tiene un gap real: el endpoint de cierre de visita (`PUT /Mobiliza/visita`) recibe `motivos` y
  `resultado` desde el frontend pero **no los persiste** (solo guarda `coord_final`/`fecha_fin`).
  Por eso hoy, al finalizar, redirigen al vendedor a Cromo para que cargue esa información a mano
  en otro sistema.
- El dashboard de efectividad (`app-mobiliza`) lee la tabla `Visitas` para calcular "Efectividad
  Proyectada", "Visitas No Val.", "Horas totales", etc. — la fórmula (`getStatsVendedores`/`getGeo`
  en `api-mobiliza`) compara `coord_inicio` contra `coord_cliente` dentro de una tolerancia en
  metros, más duración (`fecha_inicio`/`fecha_fin`). **No usa `Motivos`/`Motivos_visitas` para
  nada** — sigue en uso y no se va a reimplementar acá.

**Decisión final sobre dónde vive cada dato** (revisada tras discutirlo): el motivo/objeción/
resultado de la visita **va 100% a Cromo** como seguimiento — no se duplica en `Motivos_visitas`.
Lo único que se sigue necesitando fuera de Cromo es lo que alimenta la efectividad y la
geolocalización: `fecha_inicio`, `fecha_fin`, `coord_inicio`, `coord_final`, `coord_cliente` en la
tabla `Visitas` existente. La tabla `Motivos` se sigue leyendo (solo lectura) como catálogo de
opciones para el picklist del vendedor, pero la selección en sí no se vuelve a escribir ahí — se
envía como texto a Cromo.

Repos de referencia relevados durante el diseño:

- **api-vendedores** — Express API. Roles vía `ROLE_POLICIES`. Lecturas de warehouse (PostgreSQL,
  `analytics.*`), escrituras en MySQL `distriap_distri` vía `sequelizeWrite` (hoy tabla `Notas`),
  integración ya existente con el CRM Cromo (`src/services/crm/`, rutas en `src/routes/crm.ts`).
  **Dato clave**: `Visitas`/`Motivos`/`Equipos` viven en esa MISMA base `distriap_distri`
  (`AWS_DISTRI_DB_WRITE_HOST` == `MYSQL_HOST` de Mobiliza) — se reutiliza la conexión existente, no
  se agrega ninguna conexión nueva.
- **app-vendedores** — SPA React existente con un sistema de "Planning" (agenda de TV/supervisor,
  desktop) basado en `Notas`, y un panel de CRM (`ClientCrmPanel`/`CrmEventsList`) que ya muestra
  y crea "seguimientos" (= events de Cromo) por cliente.
- **api-mobiliza / app-mobiliza** — sistema de visitas actual (a deprecar), pero cuya base de
  datos MySQL ("Lupa") se reutiliza tal cual.

## 2. Alcance del MVP

**Incluido:**
1. Vista semanal de clientes a visitar (por día).
2. Vista diaria con detalle de horario/dirección/teléfono por cliente.
3. Reagendar un cliente / marcar "no visito" (con motivo).
4. Detalle de cliente: propuesta comercial precargada + acceso a Versus (ver ventas / más
   propuestas).
5. Iniciar visita → cerrar visita eligiendo motivo(s) de un catálogo (leído de la tabla `Motivos`
   existente, solo lectura).
6. Geolocalización de la visita: captura de posición al **iniciar** y al **finalizar** la visita
   (2 puntos), igual que hoy hace Mobiliza. Alimenta el cálculo de efectividad (comparar
   `coord_inicio` contra `coord_cliente`). NO se trackea el recorrido continuo.
7. Verificación de visita ya registrada (evita duplicados el mismo día).
8. Al cerrar visita: se actualiza `Visitas` (compatibilidad con el dashboard de efectividad
   existente) Y se genera automáticamente un seguimiento en Cromo con el/los motivo(s) elegidos —
   sin el paso manual de hoy.

**Stack decidido:** app **web/PWA** (React), sin app nativa. Al confirmarse que solo se necesita
capturar inicio/fin de la visita (no el recorrido continuo), no hace falta tracking en segundo
plano — que era lo único que forzaba ir a un runtime nativo (Capacitor). La captura de 2 puntos
funciona con `navigator.geolocation` estándar mientras el vendedor tiene la app al frente al tocar
Iniciar/Finalizar. Esto mantiene el mantenimiento tan simple como una web (deploy web, sin builds
nativos ni tiendas). Ver sección 6.

**Explícitamente fuera de alcance (backlog v2):**
- Cumplimiento de objetivo y ranking de vendedores.
- Sección de "novedades" para el vendedor.
- Link directo de WhatsApp al cliente.
- Pantalla de control de cumplimiento de agenda minuto a minuto (vista supervisor).
- Recorrido/trazo continuo de la visita o del día (tipo Strava). Requiere tracking en segundo plano,
  que NO existe en web — necesitaría empaquetar con Capacitor + un plugin de background-geolocation
  (community/Cap-go) y updates OTA (Capgo) para el mantenimiento. Se evaluó y se descartó para el
  MVP porque el negocio solo necesita confirmar presencia (inicio/fin) y duración, no el trazo.
- Migrar o reemplazar el dashboard de efectividad de `app-mobiliza` (se seguirá alimentando de las
  mismas tablas; migrarlo es un proyecto aparte).

## 3. Arquitectura

```
app-planificacion (SPA web/PWA nueva, mobile-first, independiente de app-vendedores)
        │  Bearer token (mismo esquema de auth que ya usa api-vendedores)
        ▼
api-vendedores (repo existente, + nuevo dominio "planificacion")
        │
        ├─ PostgreSQL warehouse (analytics.*, solo lectura, YA EXISTE)
        │    ├─ agenda base: campo en cliente que define día/semana asignado a su vendedor
        │    │  (nombre exacto de campo a confirmar en implementación)
        │    └─ propuesta comercial: RubroRecommendationService (ya existente)
        │
        ├─ MySQL `distriap_distri` (MISMA conexión existente `sequelizeWrite`, la que ya usa
        │    api-vendedores para Notas — NO es una conexión nueva. Confirmado:
        │    AWS_DISTRI_DB_WRITE_HOST == MYSQL_HOST de Mobiliza, DB `distriap_distri`)
        │    ├─ Visitas (visita_id, codigo_particular_vendedor, codigo_particular_cliente,
        │    │           fecha_inicio, fecha_fin, coord_inicio, coord_final, coord_cliente,
        │    │           cant_comprobantes, cant_recibos, cant_creditos, ...)
        │    │      → única fuente que se ESCRIBE. Alimenta la efectividad (dashboard existente,
        │    │        sin tocar su fórmula) con coord_inicio/fin + duración. Sin tablas nuevas.
        │    └─ Motivos (motivo_id, descripcion) — catálogo existente, SOLO LECTURA (picklist)
        │    ⚠️ `Visitas` también la lee `app-mobiliza` (dashboard de efectividad) — hay que
        │       mantener compatibilidad de columnas/semántica, solo se agrega, no se rompe.
        │
        └─ CRM Cromo, vía CrmService / CromoHttpClient (YA EXISTE, se reutiliza tal cual)
             └─ POST /crm/events — única fuente de verdad del motivo/objeción/resultado,
                se llama automáticamente al cerrar visita (ver sección 9)
```

Decisiones clave:

- **App nueva e independiente**, no una sección dentro de app-vendedores. Repo propio,
  build/deploy propio.
- **Se extiende api-vendedores** (no se crea backend nuevo, no se depende de api-mobiliza): mismo
  proceso, mismo auth/roles. Nuevo dominio `planificacion` (rutas + controller + service).
  Decisión re-confirmada: se evaluó un backend propio (api-planificacion, sucesor de api-mobiliza),
  pero para el MVP acotado a la app del vendedor gana extender api-vendedores porque auth +
  propuesta (`RubroRecommendationService`) + Cromo (`CrmService`) ya viven ahí (duplicarlos/proxear
  desde un servicio nuevo es costo sin payoff hoy). **Puerta de salida**: si el dominio de visitas
  crece hacia ser el reemplazo formal de api-mobiliza (supervisor, efectividad, más features de
  visita), se extrae entonces un servicio propio, ya conociendo la forma real del dominio.
- **Se reutiliza la tabla `Visitas` existente de la base MySQL `distriap_distri`** para el ciclo de vida de la
  visita (inicio/fin/coords) — evita romper el dashboard de efectividad de `app-mobiliza`, que
  sigue leyendo de ahí sin cambios. api-mobiliza (el servicio) se deprecia; la base de datos no.
- **El motivo/objeción/resultado NO se persiste en MySQL** (se descarta `Motivos_visitas` como
  destino de escritura) — va **100% a Cromo** como seguimiento. La tabla `Motivos` se sigue usando,
  pero solo de lectura, como catálogo de opciones para el picklist.
- **Se arregla el gap de hoy** de otra forma: en vez de hacer que `PUT /Mobiliza/visita` empiece a
  persistir `motivos`/`resultado` en MySQL, directamente se automatiza el envío a Cromo al cerrar
  la visita — eliminando el paso manual sin necesitar una nueva tabla de relación.

### Stack técnico del frontend

App **web/PWA** SPA, alineada al stack de `app-vendedores` para maximizar reuso de patrones
(interceptor de axios/token, React Query, sistema visual), con una divergencia intencional: se usa
la versión más reciente de React.

| Capa | Elección | Notas |
|---|---|---|
| Build/runtime | **Vite + React 19 + TypeScript** | React 19 (última estable) — **divergencia intencional** vs. React 18 de app-vendedores. TS 5.x. |
| PWA | **vite-plugin-pwa** | Instalable + shell offline básico. |
| Estilos | **Tailwind + shadcn/ui (Radix)** | Mismo sistema visual que app-vendedores. |
| Data fetching | **React Query (@tanstack) + axios** | Se replica el patrón de `api_http.ts` (Bearer token, auto-logout 401) de app-vendedores. |
| Routing | **react-router-dom** | SPA estándar. |
| Validación | **zod** | Consistente con el ecosistema. |
| Estado | **React Context/Providers** | El negocio va en Context; Redux Toolkit solo si aparece una necesidad concreta de UI global. |
| Mapa (2 puntos geo) | **Leaflet** (a confirmar en impl.) | Para mostrar inicio/fin sobre mapa; liviano. |
| Tests | **Vitest** | Consistente. |
| Deploy | **Firebase Hosting** | Igual que app-vendedores (build estático). |

Nota: no se usa Next.js (sí lo usa `app-lupa-web`, pero ese es un e-commerce público con SEO/SSR;
esta app es interna, detrás de login y mobile-first — un SPA con Vite es más simple y suficiente).

## 4. Fuentes de datos

| Dato | Fuente | Notas |
|---|---|---|
| Agenda base (qué cliente, qué día/semana) | Warehouse PG (`analytics.*`) | Read-only. Campo del cliente que define el día/semana asignado al vendedor. |
| Propuesta comercial (rubros bajo el promedio) | `RubroRecommendationService` (api-vendedores, ya existente) | Se reutiliza tal cual, sin lógica nueva de negocio. |
| Ventas / "Versus" | Servicios existentes de `services/sales/*` | Mismo motor que usa versus-app hoy. |
| Ciclo de vida de la visita (iniciar/cerrar, coords, duración) | MySQL `distriap_distri` — tabla `Visitas` (existente) | Se conecta directo, sin pasar por api-mobiliza. Alimenta la efectividad. |
| Catálogo de motivos (picklist al cerrar visita) | MySQL `distriap_distri` — tabla `Motivos` (existente) | Solo lectura — no se escribe `Motivos_visitas`. |
| Motivo/objeción/resultado de la visita | CRM Cromo, vía `POST /crm/events` | Única fuente de verdad — no se duplica en MySQL. |
| Geolocalización (2 puntos: inicio/fin) | MySQL `distriap_distri` — columnas `coord_inicio`/`coord_final` de `Visitas` | Captura foreground con `navigator.geolocation`. Sin recorrido continuo, sin tablas nuevas. |

## 5. Flujo principal

1. **Vista semanal** — lista de clientes por día (Lun–Vie), viene de la agenda base del
   warehouse. Muestra contador de completadas ("3/40") pero **no** consulta el estado de visitas
   acá (evitar N llamadas por los ~40 clientes de la semana completa).
2. **Vista diaria** (al entrar a un día puntual, ~8 clientes típico) — se consulta el estado de
   visita de esos clientes puntuales contra la tabla `Visitas` (¿hay una visita con
   `fecha_inicio` de ese día para ese cliente/vendedor?), para saber si ya está completada.
3. **Detalle de cliente** — botón "Propuesta" (precargada, desde `RubroRecommendationService`) y
   botón "Versus" (ver ventas / elegir más propuestas).
4. **Iniciar visita** — captura ubicación del vendedor (1 punto → `coord_inicio`), crea la fila en
   `Visitas` (`codigo_particular_vendedor`, `id_equipo`, `codigo_particular_cliente`,
   `nombre_cliente`, `coord_inicio`, `coord_cliente`, `fecha_inicio`) — mismo shape que usa
   Mobiliza hoy. `coord_cliente` es la coordenada **registrada** del cliente (no la del vendedor):
   sale del dato de ubicación del cliente que ya existe en la base (ver Preguntas abiertas). El
   `id_equipo` se deriva del vendedor igual que hace Mobiliza (`equipos[codigo_particular_vendedor]`)
   para no romper el JOIN del dashboard de efectividad.
5. **Cerrar visita** — el vendedor elige motivo(s) del catálogo (tabla `Motivos`, solo lectura, uno
   o varios). Se captura ubicación final (1 punto). El cierre:
   - Actualiza `Visitas` (`coord_final`, `fecha_fin`) — esto es lo único que persiste en MySQL.
   - Llama automáticamente a `POST /crm/events` (Cromo) con una descripción armada a partir de
     los motivos elegidos — reemplaza el redirect manual a Cromo que existe hoy. Este seguimiento
     es la única fuente de verdad del motivo/resultado de la visita.
6. **Reagendar / No visito** — el vendedor elige motivo(s) del catálogo `Motivos` y se envía el
   seguimiento a Cromo, igual que al cerrar. Para que la tarjeta figure como **resuelta** en la
   vista diaria/semanal sin ser una "visita válida" (no estuvo físicamente en el cliente), se crea
   igualmente una fila en `Visitas` con `fecha_inicio` = `fecha_fin` (duración cero) y **sin
   coords** — así el dashboard de efectividad la cuenta como visita corta/no válida (no suma
   presencia), pero la app la reconoce como "día resuelto" para ese cliente. No mueve al cliente
   estructuralmente a otro día de la agenda — es informativo/histórico.
7. **Vuelta a la vista semanal** con el cliente tildado como completado.

## 6. Geolocalización (2 puntos: inicio y fin)

- **Alcance MVP: captura de 2 puntos**, `coord_inicio` al tocar Iniciar visita y `coord_final` al
  tocar Cerrar visita — exactamente lo que hace Mobiliza hoy. No hay recorrido continuo ni
  breadcrumbs.
- Se usa `navigator.geolocation.getCurrentPosition()` estándar, con la app al frente en el momento
  de cada toque. No requiere permisos de ubicación en segundo plano.
- El objetivo del dato es alimentar la **efectividad**: la fórmula existente (`getGeo` en
  api-mobiliza) compara `coord_inicio` contra `coord_cliente` dentro de una tolerancia en metros
  para marcar la visita como "válida" (que estuvo realmente en el cliente), más la duración
  (`fecha_inicio`/`fecha_fin`). Esa fórmula no cambia — solo la seguimos alimentando.
- **Por qué NO recorrido continuo**: se evaluó (tipo Strava, para ver el trayecto aunque el
  vendedor cambie a WhatsApp o bloquee el teléfono). Eso requiere tracking en segundo plano, que
  **no existe en web/PWA** — obligaría a empaquetar con Capacitor + plugin nativo de
  background-geolocation. Se descartó para el MVP: el negocio solo necesita confirmar presencia y
  duración, no el trazo. Queda documentado en el backlog por si cambia el requerimiento.
- **Stack**: por esta decisión, app-planificacion se mantiene como **web/PWA pura** (sin runtime
  nativo), lo que simplifica el mantenimiento (deploy web, sin builds ni tiendas).
- Manejo de permiso denegado: si el vendedor no da permiso de ubicación, se permite iniciar/cerrar
  la visita igual (sin coords), con aviso — no se bloquea el flujo comercial (ver sección 10).

## 7. Verificación de visita existente (duplicados)

- Al abrir la **vista diaria**, para cada cliente visible se consulta `Visitas` filtrando por
  `codigo_particular_vendedor` + `codigo_particular_cliente` + `fecha_inicio` dentro de la fecha de
  esa tarjeta.
- Si ya existe una fila con `fecha_fin` no nula para ese cliente en esa fecha → la tarjeta se
  muestra **resuelta/tildada** (sea una visita real cerrada o un "no visito"/"reagendado" —
  ambos escriben `fecha_fin`, ver sección 5) y se **bloquea volver a resolverla** ese mismo día. Si
  el vendedor necesita corregir algo, se genera una fila nueva de ajuste (no se reabre/edita la
  anterior), igual que hoy no se editan visitas ya cerradas.
- Si existe una visita con `fecha_fin` nula (en curso) para OTRO cliente distinto al que se quiere
  visitar ahora → se bloquea iniciar una visita nueva hasta cerrar la anterior (mismo
  comportamiento que ya tiene Mobiliza: "Ya tienes una visita activa").

## 8. Catálogo de motivos (solo lectura)

Se reutiliza la tabla `Motivos` existente (`motivo_id`, `descripcion`) tal cual está en la base
"Lupa" **como fuente del picklist que ve el vendedor** — no se crea un catálogo propio nuevo, y
tampoco se escribe de vuelta ahí (no hay `Motivos_visitas` en este diseño; ver sección 9). El
prototipo visual de esta app había definido un catálogo de referencia de 9 opciones (Saqué
pedido, Pasa pedido mañana, Pedido en la semana, Precio, DS, Flete, Poco trabajo, Estoy completo,
Vacaciones); durante la implementación hay que:

1. Confirmar con `SELECT * FROM Motivos` si el contenido actual ya cubre ese set.
2. Si faltan opciones relevantes para el flujo de objeciones por rubro, agregarlas como filas
   nuevas a la tabla existente (no crear una tabla paralela).

El vendedor puede elegir uno o varios motivos (multi-select) al cerrar/reagendar/no-visitar — esa
selección se manda como texto al seguimiento de Cromo (sección 9), no se persiste en MySQL.

## 9. Motivo/resultado de la visita → Cromo (única fuente de verdad)

Al cerrar la visita (o reagendar/no-visitar), se llama automáticamente a `POST /crm/events` (ya
existente en api-vendedores) con:
- `clientCode`: código del cliente visitado.
- `descripcion`: armada a partir de los motivos elegidos (ej. "Visita — Amortiguadores: Precio,
  Pasa pedido mañana").

Esto **reemplaza el paso manual de hoy** donde se redirige al vendedor a Cromo
(`?search=...&type=addSeguimiento`) para que cargue la información él mismo. El vendedor ya no
necesita salir de la app para dejar registro en Cromo, y **no hay ninguna copia de este dato en
MySQL** — Cromo es la única fuente de verdad del motivo/objeción/resultado. Lo único que se
persiste en `Visitas` es lo que hace falta para efectividad y geolocalización (sección 6 y 7).

## 10. Manejo de errores

- **CRM Cromo no vinculado / sesión expirada** (`401` en las rutas `/crm/*`): como Cromo es la
  ÚNICA fuente de verdad del motivo/resultado (no hay copia en MySQL), esto es más sensible que
  antes — la visita puede cerrarse igual en `Visitas` (fecha_fin/coords), pero hay que dejar
  explícitamente marcado/notificado que el seguimiento quedó pendiente de reintentar, para no
  perder silenciosamente esa información.
- **CRM no disponible** (`503`): mismo comportamiento — se cierra la visita, se encola/reintenta el
  seguimiento, y se avisa al vendedor que quedó pendiente (no se pierde, pero tampoco queda oculto).
- **Cliente no encontrado en Cromo** (`CRM_CLIENT_NOT_FOUND`): la visita se cierra igual en
  `Visitas`; se informa que no se pudo generar el seguimiento en Cromo (mismo criterio que ya
  define api-vendedores: nunca se crean clientes en Cromo desde acá). Dado que no hay respaldo del
  motivo en MySQL, considerar mostrarle al vendedor el texto que se iba a enviar, para que lo pueda
  cargar él mismo en Cromo como fallback puntual.
- **Warehouse no alcanzable**: la vista semanal/diaria debe comunicar que la agenda no está
  disponible temporalmente.
- **Geolocalización no disponible/rechazada**: se permite iniciar/cerrar visita igual (sin coords),
  con aviso al vendedor; no debe bloquear el flujo comercial por un permiso de ubicación denegado.

## 11. Fuera de alcance / Backlog v2

- Cumplimiento de objetivo y ranking de vendedores.
- Novedades para el vendedor.
- Link directo de WhatsApp al cliente.
- Pantalla de control de cumplimiento de agenda minuto a minuto (vista supervisor).
- Recorrido/trazo continuo de la visita o del día (traslados entre clientes) — requiere empaquetar
  con Capacitor + plugin de background-geolocation (community/Cap-go) + OTA (Capgo) para mantener
  el bajo costo de mantenimiento. Descartado del MVP porque solo se necesita presencia (inicio/fin)
  y duración.
- Migración o reemplazo del dashboard de efectividad (`app-mobiliza`) hacia el nuevo ecosistema.
- Endpoint bulk en Cromo (eventos por lista de clientes / rango de fechas) — no es crítico ahora
  porque el estado de visita ya no depende de leer Cromo, sino de la tabla `Visitas` propia.

## 12. Preguntas abiertas (a resolver al inicio de la implementación)

Ninguna bloquea el diseño, pero son investigaciones concretas que deben hacerse en las primeras
tareas del plan (no asumir):

1. **Campo de agenda en el warehouse**: confirmar el nombre exacto del campo del cliente que define
   el día/semana de visita asignado a su vendedor (`analytics.*`). De acá sale la vista semanal.
2. **Origen de `coord_cliente`**: confirmar de qué tabla/campo sale la coordenada registrada del
   cliente (en Lupa hoy sale de la ubicación del cliente; en app-vendedores existe
   `updateClientsCoordinates` vía microservicio de clientes). Definir la fuente única para esta app.
3. **Resolución de `codigo_particular_vendedor` desde el token**: el código de cartera del VENDEDOR
   no viene en `/api/auth/me` (ver `utils/planningOwnership.ts` en app-vendedores, que ya documenta
   este problema). Definir cómo lo obtiene api-vendedores para escribir `Visitas` con el código
   correcto (p.ej. resolverlo vía SellerProvider/cartera, o exponerlo en el backend).
4. **Derivación de `id_equipo`**: replicar el mapeo `equipos[codigo_particular_vendedor]` que usa
   `createVisita` de Mobiliza, para que las filas nuevas queden consistentes con el dashboard de
   efectividad (que hace JOIN contra `Equipos`).
5. **Contenido de `Motivos`**: `SELECT * FROM Motivos` para ver si el catálogo actual ya cubre el
   set de 9 del prototipo o hay que agregar filas.
6. **Conexión a la base**: RESUELTO — no hace falta conexión ni credenciales nuevas.
   `Visitas`/`Motivos`/`Equipos` viven en `distriap_distri`, la misma base que api-vendedores ya usa
   vía `sequelizeWrite` (para `Notas`). Solo confirmar que las tablas son visibles desde esa
   conexión (`SHOW TABLES LIKE 'Visitas'`). Opcional a futuro: dirigir los reads a la réplica de
   lectura (`AWS_DISTRI_DB_HOST`) en vez del host de escritura.
