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

El diseño general de la app (flujo, geolocalización, alcance) está en
`docs/superpowers/specs/2026-07-22-app-planificacion-design.md`.

El **diseño del backend del dominio de planificación** (tablas, endpoints, ciclo de visitas) vive
en el repo de api-vendedores, rama `feature/planificacion-backend`:
`docs/superpowers/specs/2026-07-27-planificacion-visitas-design.md` + su plan de implementación
en `docs/superpowers/plans/2026-07-27-planificacion-visitas.md`. **Ese spec es el que manda sobre
el modelo de datos y los endpoints** — revierte dos decisiones del spec del 22/07 (ver "Decisiones
no obvias" abajo). Léelos antes de tocar agenda, ciclo o el manejo de visitas/motivos/Cromo.

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
                                             │       pl_ciclo_semana    la vuelta concreta
                                             │       pl_ciclo_cliente ★ plan congelado + resolución
                                             │       pl_visita          inicio/fin + coords 2 puntos
                                             │       pl_resolucion_motivo  motivo estructurado
                                             │     Motivos (existente, SOLO LECTURA, picklist)
                                             │     Visitas (existente, YA NO se escribe — se deprecia
                                             │       junto con api-mobiliza)
                                             │
                                             └─► CRM Cromo (POST /crm/events, ya existente)
                                                   canal narrativo para el resto de la organización
                                                   — se llama automático al cerrar visita, best-effort
```

- **El ciclo de visitas es un dominio propio con sus propias tablas** (`pl_ciclo_semana`,
  `pl_ciclo_cliente`, `pl_visita`, `pl_resolucion_motivo`), en la misma base MySQL
  `distriap_distri` y reusando la conexión existente `sequelizeWrite`. Motivo: sin persistir **el
  plan** (a quién había que visitar) no hay denominador, y la cobertura/efectividad —el objetivo
  del proyecto— es incalculable. El dashboard de efectividad de `app-mobiliza` que leía `Visitas`
  se deprecia junto con `api-mobiliza`, así que no hay doble escritura ni migración.
- **El motivo SÍ se persiste estructurado**, en `pl_resolucion_motivo` (`ciclo_cliente_id` ×
  `motivo_id`), **además** de enviarse a Cromo como texto. Motivo: Cromo recibe una frase armada
  por `buildSeguimientoDescripcion`, y sobre texto libre no se puede hacer un `GROUP BY` — no se
  puede responder "cuál es la objeción más frecuente en la zona norte". La tabla `Motivos` sigue
  siendo solo lectura (catálogo del picklist).
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

## Decisiones no obvias (no las repitas sin releer el spec)

- **La entidad central es el ciclo, no la visita.** Un ciclo (`pl_ciclo_semana`) es una vuelta
  concreta del vendedor por una semana de su rotación: no la etiqueta `s2` en abstracto, sino "la
  vez que V 2 pasó por la semana 2 arrancando el 27/07". Hace falta porque **la etiqueta `s2` se
  repite cada 5 semanas**: guardar el string `"s2d3"` en la visita haría que en la próxima vuelta
  el sistema creyera que el cliente ya fue resuelto.
- **Al abrir el ciclo se congela el plan** (snapshot desde el insumo externo hacia
  `pl_ciclo_cliente`). La asignación cliente→`sNdM` la mantiene otra área sobre un Excel; si se
  leyera en vivo, un cambio ajeno un miércoles movería la agenda a mitad de semana y reescribiría
  la cobertura histórica hacia atrás.
- **La asignación cliente→`sNdM` NO es nuestra.** La va a cargar otra área en el campo "visita" del
  cliente. Se consume por el seam `AgendaRepository.findVisitAssignments`, hoy respaldado por
  `src/mocks/agendaMock.json` (solo tiene el vendedor `V 2`). **No se agregan campos al warehouse**
  — eso crearía una dependencia con `sync-dagster`, que vive en otro repo.
- **El gap real del sistema actual** (`PUT /Mobiliza/visita` recibe `motivos`/`resultado` del
  frontend pero no los persiste — por eso hoy redirigen al vendedor a Cromo a mano) se resuelve
  persistiendo el motivo estructurado **y** automatizando el envío a Cromo. El orden importa:
  **primero se persiste el hecho, después se notifica a Cromo**. Así un Cromo caído deja de ser
  pérdida de datos y pasa a ser solo un mensaje demorado.
- **La "semana actual" la resuelve el backend, no el front.** Es el ciclo abierto del vendedor
  (`GET /planificacion/ciclo/actual`). Se descartó el cálculo mod-5 sobre un ancla local porque se
  desincroniza al reinstalar la app o cambiar de dispositivo, sin que nadie lo detecte.
- **Cerrar la semana exige que no queden clientes pendientes** en plan. Si faltan, el backend
  devuelve 409 con la lista.
- **El catálogo de motivos es la tabla `Motivos` ya existente, pero solo de lectura** (picklist).
  El prototipo visual sugiere 9 opciones de referencia — hay que confirmar contra
  `SELECT * FROM Motivos` si ya están cargadas o faltan agregar filas.
- **Geolocalización: solo 2 puntos (inicio y fin de la visita)**, con `navigator.geolocation`
  estándar y la app al frente. Alimenta la efectividad (compara `coord_inicio` vs `coord_cliente`).
  NO hay recorrido continuo ni tracking en segundo plano — eso no existe en web y se descartó
  porque el negocio solo necesita confirmar presencia + duración. Por eso la app se queda web/PWA
  (sin Capacitor). Si algún día se pide el trazo continuo, el camino documentado es Capacitor +
  plugin background-geolocation + OTA (Capgo) — está en el backlog del spec.
- **Al cerrar visita se genera un seguimiento en Cromo automáticamente** (`POST /crm/events`),
  reemplazando el redirect manual a Cromo que existe hoy en el flujo de Lupa.
- **La vista semanal SÍ muestra el estado de cada cliente**, y es gratis: el estado vive en la
  misma fila de `pl_ciclo_cliente` que ya se lee. (La restricción vieja de "no consultar estado en
  la semanal para evitar ~40 consultas" desapareció con el snapshot.)
- **No se editan/reabren visitas ya cerradas.** Si el vendedor necesita corregir algo, se genera
  una visita nueva de ajuste.
- **Reagendar dentro del ciclo mueve el `dia` y deja al cliente PENDIENTE.** No lo resuelve: si lo
  resolviera, mover un cliente de martes a jueves lo sacaría del pendiente y la semana cerraría sin
  haberlo visitado — el cumplimiento sería inflable con dos clicks. El estado `reagendada` se
  reserva para cuando se reagenda más allá del ciclo actual.

## Fuera de alcance (no implementar salvo pedido explícito)

Cumplimiento de objetivo/ranking de vendedores, novedades para el vendedor, link de WhatsApp al
cliente, pantalla de control de cumplimiento minuto a minuto (vista supervisor), recorrido/trazo
continuo de la visita o del día (requiere Capacitor + plugin nativo), migración del dashboard de
efectividad de app-mobiliza. Están en el backlog v2 del spec, no en este MVP.
