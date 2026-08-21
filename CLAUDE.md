# CLAUDE.md

Guía para trabajar en **app-planificacion**: qué es esta app, cómo se relaciona con el resto del
ecosistema DistriSuper/Versus/Lupa, y qué NO hacer por costumbre de otros repos.

## Qué es esta app

Pantalla mobile para que el **vendedor** planifique y ejecute su ruta de visitas a clientes:

1. Ve su agenda semanal de clientes a visitar (por día).
2. Entra a la agenda de un día puntual y ve horario/dirección/teléfono de cada cliente.
3. Puede reagendar un cliente o marcarlo como "no visito" (con motivo).
4. Al llegar al cliente: ve la propuesta comercial precargada (rubros donde compra por debajo del
   promedio de la zona) y puede abrir "Versus" para ver ventas o elegir más propuestas.
5. Inicia visita (captura ubicación en ese momento), ofrece lo que ve en la propuesta/Versus, y al
   cerrar la visita elige uno o más motivos de un catálogo existente (Saqué pedido, Precio,
   Vacaciones, etc.) — captura ubicación de nuevo al cerrar.
6. Vuelve a la vista semanal con el cliente tildado como completado.

Es una **app web/PWA pura** (React), sin runtime nativo (sin Capacitor). Ver la decisión de
geolocalización más abajo.

## Stack técnico

Alineado a `app-vendedores` (mismo API, mismo auth) para reusar patrones, con React en su versión
más reciente:

- **Vite + React 19 + TypeScript** — React 19 es divergencia intencional vs. React 18 de
  app-vendedores (se pidió la última versión). No es un descuido.
- **vite-plugin-pwa** — instalable / shell offline.
- **Tailwind + shadcn/ui (Radix)** — mismo sistema visual que app-vendedores.
- **React Query (@tanstack) + axios** — se replica el patrón de `src/api/api_http.ts` de
  app-vendedores (Bearer token automático, auto-logout en 401).
- **react-router-dom**, **zod**, **React Context/Providers** para estado de negocio.
- **Leaflet** (a confirmar) para mostrar los 2 puntos de geo sobre mapa.
- **Vitest** para tests. Deploy en **Vercel** (team de la empresa, no cuenta personal).

No se usa Next.js (lo usa app-lupa-web, pero ese es e-commerce público; esta app es interna,
autenticada y mobile-first — un SPA con Vite alcanza y es más simple).

Esta app **reemplaza al flujo de "Visitas" que hoy vive en Lupa** (botón "Visitas" en
`lupa.disturisuper.com`, respaldado por `api-mobiliza`), que se va a deprecar. No reemplaza los
datos — reusa la misma base de datos y tablas.

## Documentación: qué leer y qué NO

Hay dos clases de documento en este repo y **no son intercambiables**:

- **`docs/dominio/`** — documentación **viva**: describe cómo funciona el sistema hoy. Es lo que hay
  que leer, y lo que hay que corregir si el código la contradice.
- **`docs/superpowers/specs/` y `plans/`** — registro **histórico** de decisiones, con fecha. Sirven
  para entender por qué algo terminó así. **No son autoridad sobre el estado actual**: varios fueron
  reemplazados por specs posteriores, y algunos describen tablas que ya no existen. No los cites como
  si fueran el modelo vigente.

**Antes de tocar agenda, plan, ciclo o resoluciones, leé estos dos:**

1. **[`docs/dominio/modelo.md`](docs/dominio/modelo.md)** — qué significa cada concepto (plan original
   / plan actual / hecho / ciclo), quién puede escribir dónde, cómo se mide, y **cuatro ideas
   descartadas con su razón** para que no se vuelvan a proponer. Empezá acá.
2. **[`docs/dominio/tablas.md`](docs/dominio/tablas.md)** — el esquema: para qué existe cada tabla y
   por qué cada constraint está donde está. Incluye las tablas que **ya no existen**, para reconocerlas
   cuando aparezcan en un spec viejo.

El DDL consolidado —la fuente de verdad del esquema— vive en api-vendedores,
`docs/db-notes/planificacion-ciclo-tables.sql`. El modelo de rotación editable **ya está mergeado en
`master`**, no en una rama.

Prototipo visual de referencia (mockups ya validados con el usuario): `Prototipo/` — screenshots
en `Prototipo/screenshots/` y prototipo interactivo en `Prototipo/Agenda Vendedor.dc.html`.

## Cómo se relaciona con el resto del ecosistema

Esta app **no tiene backend propio**. Es una SPA que consume la API existente **api-vendedores**
(`C:/Users/matia/Documents/distrisuper/business-workflow/versus/api-vendedores`), extendida con un
nuevo dominio `planificacion`.

```
app-planificacion  ──Bearer token──►  api-vendedores (dominio nuevo "planificacion")
                                             │
                                             ├─► Asignación cliente → sNdM  (INSUMO EXTERNO)
                                             │     hoy: src/mocks/agendaMock.json
                                             │     mañana: campo "visita" que carga otra área
                                             │     seam: AgendaRepository.findVisitAssignments
                                             │
                                             ├─► PostgreSQL warehouse (read-only, SIN cambios)
                                             │     fct_clients → card del cliente (dirección,
                                             │       teléfono, coords, descuentos, pago)
                                             │     propuesta comercial (RubroRecommendationService)
                                             │
                                             ├─► MySQL distriap_distri (MISMA conexión existente
                                             │     sequelizeWrite, la que ya usa para Notas —
                                             │     NO es conexión nueva)
                                             │     TABLAS PROPIAS (prefijo pl_, las escribimos):
                                             │       pl_rotacion          la vuelta completa
                                             │       pl_rotacion_semana   set de semanas + nombre zona
                                             │       pl_rotacion_cliente ★ EL PLAN, editable
                                             │       pl_reacomodacion     auditoría de cada movimiento
                                             │       pl_ciclo_semana      dónde trabajó, por semana
                                             │       pl_resolucion      ★ EL HECHO (visita/no visité)
                                             │       pl_resolucion_motivo  motivo a nivel visita
                                             │       pl_visita_rubro       propuesta congelada
                                             │       pl_visita_rubro_motivo motivo a nivel rubro
                                             │       pl_motivo             catálogo (sembrado)
                                             │     Visitas (existente, YA NO se escribe — se deprecia
                                             │       junto con api-mobiliza)
                                             │
                                             └─► CRM Cromo (POST /crm/events, ya existente)
                                                   canal narrativo para el resto de la organización
                                                   — se llama automático al cerrar visita, best-effort
```

- **La planificación es un dominio propio con sus propias tablas** (prefijo `pl_`), en la misma base
  MySQL `distriap_distri` y reusando la conexión existente `sequelizeWrite`. Motivo: sin persistir
  **el plan** (a quién había que visitar) no hay denominador, y la cobertura/efectividad —el objetivo
  del proyecto— es incalculable. El dashboard de efectividad de `app-mobiliza` que leía `Visitas`
  se deprecia junto con `api-mobiliza`, así que no hay doble escritura ni migración.
- **El motivo SÍ se persiste estructurado**, en `pl_resolucion_motivo` (`resolucion_id` ×
  `motivo_id`), **además** de enviarse a Cromo como texto. Motivo: Cromo recibe una frase armada
  por `buildSeguimientoDescripcion`, y sobre texto libre no se puede hacer un `GROUP BY` — no se
  puede responder "cuál es la objeción más frecuente en la zona norte". El catálogo es `pl_motivo`,
  tabla propia sembrada con `INSERT IGNORE` (ya no es la vieja `Motivos` compartida).
- **api-mobiliza se está deprecando** (por eso existe este proyecto), pero su base de datos sigue
  viva — api-vendedores se convierte en el nuevo cliente que escribe/lee `Visitas` directamente,
  sin pasar por el servicio api-mobiliza.
- **app-vendedores** es un repo hermano (SPA existente, desktop-first) con su propio sistema de
  "Planning" (agenda de TV/supervisor sobre la tabla `Notas`, distinta de `Visitas`). No lo
  reemplaza ni comparte componentes de UI — son conceptos relacionados pero paralelos.
- **api-vendedores** es la única API que consume esta app. Antes de agregar un endpoint nuevo,
  revisar si el dato ya existe (warehouse, `RubroRecommendationService`, `CrmService`, o las
  tablas de Lupa) — casi todo lo que necesita esta app ya está expuesto o es una extensión chica
  de algo existente.

## El modelo: plan, hecho y ciclo

**Esto es lo primero que hay que entender, y lo que responde la mayoría de las preguntas de diseño
que aparecen.** Detalle completo en [`docs/dominio/modelo.md`](docs/dominio/modelo.md).

Hay **tres capas separadas**, y una operación toca una sola:

| capa | tabla | responde |
|---|---|---|
| **Plan original** | reconstruible desde `pl_reacomodacion` | qué se había planificado |
| **Plan actual** | `pl_rotacion_cliente` — una fila por celda (cliente, semana, día), editable | dónde va el cliente ahora |
| **Hecho** | `pl_resolucion` — una por fila del plan, inmutable | qué pasó, y cuándo |
| *(al costado)* **Ciclo** | `pl_ciclo_semana` | dónde estuvo trabajando el vendedor |

- **Un hecho nunca pertenece a un ciclo: pertenece a un cliente y a un momento.** `pl_resolucion` no
  tiene ninguna columna que apunte al ciclo — solo `rotacion_cliente_id` y `fecha_inicio`. Toda la
  analítica filtra por `fecha_inicio` y recién después salta al plan. Corolario: si el vendedor
  visita hoy a un cliente de otra semana, **el hecho queda hoy y el plan no se toca**.
- **Corregir el plan y registrar un hecho son cosas distintas.** Si el cliente **de ahora en más** va
  en otra semana → es plan, se mueve. Si **hoy pasó por ahí y lo visitó** → es un hecho, se registra
  solo. Mover el plan para reflejar una visita puntual lo corrompe: la próxima vuelta el cliente
  queda en la zona equivocada y se pierde la línea de base.
- **"Pendiente" no es un estado: es la ausencia de resolución.** Y **no es lo mismo que `no_visita`**
  — uno es que nadie hizo nada, el otro es un hecho declarado con motivo agrupable. **Nunca
  auto-resolver pendientes** (ni al cerrar, ni exigiendo justificación): inventa un hecho comercial
  que nadie declaró, contamina el `GROUP BY` de motivos, y como una fila resuelta ya no se puede
  reacomodar (`FILA_RESUELTA`), impide rescatar al cliente después.
- **La unidad de medida es la rotación, no la semana.** El denominador son las filas de
  `pl_rotacion_cliente` de esa rotación, y **reacomodar no lo cambia**. La vista semanal es un
  desglose que se mueve mientras la rotación está abierta; el número que se reporta hacia arriba es
  el de la rotación **cerrada**.
- **El denominador cuenta VISITAS PLANIFICADAS, no clientes.** El unique del plan es
  `(rotacion_id, cliente, semana, dia)` y no `(rotacion_id, cliente)`: hay clientes quincenales que se
  visitan dos veces por vuelta, y con el unique por cliente eran irrepresentables. Un quincenal tiene
  dos filas y aporta 2. Es la trampa más fácil del esquema.
- **`no_visita` no sube la cobertura** (bucket separado de `visitados`), y **`resueltos / total` es
  gameable: no usarlo como cumplimiento.** `estaResuelto` es `true` para `no_visita`, así que
  declarar "No visité · Cerrado" sobre todo da 100% con cero visitas — y un `no_visita` hoy no
  captura ubicación.
- **Los dos pueden mover el plan, y todo movimiento queda atribuido** en `pl_reacomodacion`
  (`semana_antes/dia_antes → semana_despues/dia_despues`, `origen: 'vendedor' | 'gerencia'`). Por eso
  el plan puede ser mutable sin perder la línea de base. El día dentro de su semana es del vendedor
  (es táctico); la semana la puede mover pero es lo que gerencia debería revisar.
- **La rotación se completa cuando están todas sus semanas, y NO en orden.** `proponerSemana` propone
  una de las que **faltan**. Las semanas son zonas y cuál se hace primero es una decisión del mundo
  real. No volver al `(última % 5) + 1`: asumía cinco semanas contiguas, y hay vendedores con cuatro.
- **La asignación cliente→`sNdM` NO es nuestra.** La va a cargar otra área en el campo "visita" del
  cliente. Se consume por el seam `AgendaRepository.findVisitAssignments`, hoy respaldado por
  `src/mocks/agendaMock.json` (solo tiene el vendedor `V 2`), y se lee **una sola vez por rotación**,
  al materializar. **No se agregan campos al warehouse** — eso crearía una dependencia con
  `sync-dagster`, que vive en otro repo.

## Decisiones no obvias (no las repitas sin leer `docs/dominio/`)
- **El gap real del sistema actual** (`PUT /Mobiliza/visita` recibe `motivos`/`resultado` del
  frontend pero no los persiste — por eso hoy redirigen al vendedor a Cromo a mano) se resuelve
  persistiendo el motivo estructurado **y** automatizando el envío a Cromo. El orden importa:
  **primero se persiste el hecho, después se notifica a Cromo**. Así un Cromo caído deja de ser
  pérdida de datos y pasa a ser solo un mensaje demorado.
- **La "semana actual" la resuelve el backend, no el front.** Es el ciclo abierto del vendedor
  (`GET /planificacion/ciclo/actual`). Se descartó el cálculo mod-5 sobre un ancla local porque se
  desincroniza al reinstalar la app o cambiar de dispositivo, sin que nadie lo detecte.
- **El vendedor no cierra la semana: el cierre es automático, no bloquea, y es invisible para él.**
  No existe `CerrarSemanaSheet` ni ninguna llamada a `ciclo/cerrar` en el front, y desde el spec
  `2026-08-12-semana-hecha-cierre-invisible-design.md` tampoco existe el 409 `CAMBIO_DE_SEMANA`:
  operar sobre un cliente de otra zona **ya no cierra nada** — `asegurar` devuelve el ciclo abierto
  tal cual, sin cartel ni confirmación. El único cierre real pasa dentro de `sincronizar` (el lunes,
  al abrir la app o al volver del background). **Cerrar no crea resoluciones**: los pendientes
  quedan pendientes y la cobertura los cuenta como no cubiertos.
- **El vendedor no ve ciclos ni rotaciones: ve zonas, días y clientes.** Es una restricción de diseño
  durable, no un detalle de esta feature — cualquier texto o estado nuevo dirigido al vendedor tiene
  que pasar este filtro antes de escribirse. Corolario práctico: "semana N" no es vocabulario de
  vendedor. En su UI es `pl_rotacion_semana.descripcion` (el nombre de la zona, "Zárate"), con el
  número como único fallback si esa zona nunca se nombró; "semana" queda reservado para el
  calendario (`fecha_lunes`, la semana laboral). Ver el spec de arriba, sección "El vocabulario:
  zona, no semana".
- **El ciclo es la semana laboral: lunes a viernes, siempre.** `fecha_lunes` en TZ de negocio es lo
  que decide cuándo vence — no se infiere de `fecha_apertura`, porque un ciclo abierto un viernes
  viviría hasta el viernes siguiente. Los feriados no son un caso especial y los días que ya pasaron
  no generan lógica: no hay "día vencido".
- **Las horas se formatean en TZ de negocio, no en la del dispositivo.** La API manda instantes
  ISO en UTC (`fechaInicio`/`fechaFin`); la hora visible sale de `horaNegocio` en `src/lib/fechas.ts`,
  anclada a `America/Argentina/Buenos_Aires` vía `Intl`. Nunca `slice(11, 16)` sobre el ISO (eso
  muestra Greenwich: es lo que hizo que el dashboard marcara 15:07 para una visita de las 12:07) ni
  `toLocaleTimeString()` pelado (la notebook de gerencia con otra TZ correría los horarios del
  equipo). El campo `fecha` en cambio NO se recalcula acá: es el día de negocio que ya resolvió el
  backend, y es la clave de agrupación de la cobertura.
- **Geolocalización: solo 2 puntos (inicio y fin de la visita)**, con `navigator.geolocation`
  estándar y la app al frente. Alimenta la efectividad (compara `coord_inicio` vs `coord_cliente`).
  NO hay recorrido continuo ni tracking en segundo plano — eso no existe en web y se descartó
  porque el negocio solo necesita confirmar presencia + duración. Por eso la app se queda web/PWA
  (sin Capacitor). Si algún día se pide el trazo continuo, el camino documentado es Capacitor +
  plugin background-geolocation + OTA (Capgo).
- **Iniciar visita exige estar a ≤100 m del cliente; cerrar NO tiene ese gate.** La regla vive
  entera en el front (`src/lib/distancia.ts`, `RADIO_INICIO_METROS`), no en api-vendedores: es
  una guía operativa, no un candado infalseable. Bloquea por evidencia positiva de lejanía —
  `distancia − precisión del fix > 100 m` — así que un fix grueso de wifi/antena (la segunda
  etapa de `capturarUbicacion()`, que puede errar cientos de metros) no bloquea a un vendedor
  parado en el local. El mapa de `IniciarVisitaMapa` muestra la distancia en vivo y deshabilita
  el botón mientras esté fuera de rango — y también mientras el primer fix todavía no llegó
  (`calculando`, "Calculando tu posición…"): sin ese estado transitorio el botón queda
  habilitado como si ya se hubiera confirmado la cercanía, cuando en realidad no se sabe nada
  todavía (puede tardar varios segundos con mala señal). Es distinto de `sinUbicacion`, que sí
  deja iniciar a propósito, pero solo después de que el GPS realmente falló, no mientras sigue
  resolviendo. Y una vez que hubo un fix bueno, un fallo posterior (el watch pierde señal, o
  "Recalcular posición" falla) NO reactiva `sinUbicacion` — sería contradictorio mostrar "podés
  iniciar igual" al lado de la distancia ya conocida, con el botón todavía bloqueado por ese fix
  anterior. Ese caso usa un aviso distinto ("No pudimos actualizar tu posición. Mostrando la
  última conocida.") vía `errorActualizando`, gobernado por `marcarFixFallido()`/
  `marcarFixExitoso()` y un `posicionRef` (el `watchPosition` vive todo el ciclo del mapa y sus
  callbacks no se redefinen en cada fix, así que necesitan un ref para ver el último `posicion`
  real y no el del render en que se armaron).
- **`VisitaFlow.onIniciar` repite el chequeo con la
  coordenada definitiva**, para que tocar el botón en el instante en que el watch marcó "cerca" no
  lo saltee. El cierre no bloquea a propósito: para esa altura ya se puede haber ido del local
  por cualquier motivo, y bloquearlo dejaría visitas abiertas para siempre. No confundir
  `RADIO_INICIO_METROS` con `TOLERANCIA_METROS` de `analiticaFormat.ts` — hoy coinciden en 100 m
  pero son conceptos distintos (gate operativo vs. umbral de medición post-hoc).
- **Cerrar visita exige un mínimo de `min(2, total ofrecidos)` rubros completos, no todos.**
  Vive en `VisitaSheet.tsx` (`minimoRequerido`/`faltanParaMinimo`). Revierte a propósito la
  decisión del spec `2026-07-31-resolucion-en-lote-y-borrador-local-design.md`, que había
  endurecido el gate a "todos completos". Los rubros que queden sin tocar siguen en ámbar en
  la tabla y se pueden cargar después de cerrada (`ofrecimientosPendientes` en
  `VisitaFlow.onCerrarVisita` ya avisa cuántos quedan).
- **Al cerrar visita se genera un seguimiento en Cromo automáticamente** (`POST /crm/events`),
  reemplazando el redirect manual a Cromo que existe hoy en el flujo de Lupa.
- **La vista semanal SÍ muestra el estado de cada cliente**, y es gratis: sale del `LEFT JOIN` con la
  resolución de cada fila del plan, que ya se lee.
- **No se editan/reabren resoluciones ya cerradas.** `pl_resolucion` es inmutable, con
  `UNIQUE (rotacion_cliente_id)`. Si el vendedor necesita corregir algo, se genera un hecho nuevo de
  ajuste. Y una fila **resuelta ya no se puede reacomodar** (`FILA_RESUELTA`): resolver es la única
  puerta sin retorno del dominio.
- **Reagendar mueve `(semana, dia)` y deja al cliente PENDIENTE.** No lo resuelve: si lo resolviera,
  mover un cliente de martes a jueves lo sacaría del pendiente y la semana cerraría sin haberlo
  visitado — el cumplimiento sería inflable con dos clicks. **No hay estado `reagendada`**: el enum
  tiene cuatro valores, `pendiente | en_curso | visitada | no_visita`.

## Fuera de alcance (no implementar salvo pedido explícito)

Cumplimiento de objetivo/ranking de vendedores, novedades para el vendedor, link de WhatsApp al
cliente, recorrido/trazo continuo de la visita o del día (requiere Capacitor + plugin nativo),
migración del dashboard de efectividad de app-mobiliza.

Las vistas de gerencia **sí existen** y no están fuera de alcance: `/analitica` (cobertura y
efectividad), `/analitica/actividad` (actividad en vivo) y `/analitica/ruta` (edición de la rotación
con drag&drop). Lo que sigue afuera es el control minuto a minuto de un vendedor puntual.

Y hay tres cosas pendientes con su razón anotada en [`docs/dominio/modelo.md`](docs/dominio/modelo.md),
para no rediscutirlas: la vista agregada de movimientos para gerencia, el motivo de cierre a nivel
ciclo, y capturar ubicación en `no_visita`. Ese archivo también lista **cuatro ideas descartadas** —
auto-resolver pendientes, justificación obligatoria, semanas secuenciales, UI de rescate masivo — que
son las que más vuelven a proponerse.
