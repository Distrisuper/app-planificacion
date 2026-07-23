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
- **Vitest** para tests. Deploy en **Firebase Hosting**.

No se usa Next.js (lo usa app-lupa-web, pero ese es e-commerce público; esta app es interna,
autenticada y mobile-first — un SPA con Vite alcanza y es más simple).

Esta app **reemplaza al flujo de "Visitas" que hoy vive en Lupa** (botón "Visitas" en
`lupa.disturisuper.com`, respaldado por `api-mobiliza`), que se va a deprecar. No reemplaza los
datos — reusa la misma base de datos y tablas.

El diseño completo, con todas las decisiones y su razón, está en
`docs/superpowers/specs/2026-07-22-app-planificacion-design.md`. Léelo antes de tocar el flujo de
agenda, geolocalización o el manejo de visitas/motivos/Cromo — ahí está el "por qué" de decisiones
no obvias.

Prototipo visual de referencia (mockups ya validados con el usuario): `Prototipo/` — screenshots
en `Prototipo/screenshots/` y prototipo interactivo en `Prototipo/Agenda Vendedor.dc.html`.

## Cómo se relaciona con el resto del ecosistema

Esta app **no tiene backend propio**. Es una SPA que consume la API existente **api-vendedores**
(`C:/Users/matia/Documents/distrisuper/business-workflow/versus/api-vendedores`), extendida con un
nuevo dominio `planificacion`.

```
app-planificacion  ──Bearer token──►  api-vendedores (dominio nuevo "planificacion")
                                             │
                                             ├─► PostgreSQL warehouse (read-only)
                                             │     agenda base (día/semana por cliente)
                                             │     propuesta comercial (RubroRecommendationService)
                                             │
                                             ├─► MySQL distriap_distri (MISMA conexión existente
                                             │     sequelizeWrite, la que ya usa para Notas —
                                             │     NO es conexión nueva)
                                             │     Visitas (existente, ÚNICA que se escribe:
                                             │       inicio/fin + coords 2 puntos, alimenta efectiv.)
                                             │     Motivos (existente, SOLO LECTURA, picklist)
                                             │     (sin tablas nuevas)
                                             │
                                             └─► CRM Cromo (POST /crm/events, ya existente)
                                                   ÚNICA fuente de verdad del motivo/objeción/
                                                   resultado — se llama automático al cerrar visita
```

- **No se crea un modelo de datos propio para el ciclo de vida de la visita.** Se reutiliza la
  tabla `Visitas` de la base MySQL `distriap_distri` (la misma que api-vendedores ya usa para
  `Notas`) que hoy también usa `api-mobiliza`. Motivo: ese mismo dato lo
  consume un dashboard de efectividad ya en producción (`mobiliza/app-mobiliza`, Firebase
  `appvendedores-3e943`) — si se migra a tablas nuevas, ese dashboard se rompe. Se agrega, no se
  reemplaza el schema.
- **El motivo/objeción/resultado de la visita NO se persiste en MySQL.** Va 100% a Cromo como
  seguimiento (`POST /crm/events`). La tabla `Motivos` se sigue leyendo (solo lectura) como
  catálogo de opciones para el picklist, pero la selección del vendedor no se vuelve a escribir en
  ninguna tabla propia — no hay `Motivos_visitas` en este diseño.
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

- **Se reutiliza la tabla `Visitas` de `distriap_distri` tal cual**, reusando la conexión existente
  `sequelizeWrite` (la misma DB que ya usa para `Notas` — NO se agrega conexión nueva; confirmado
  que `AWS_DISTRI_DB_WRITE_HOST` == `MYSQL_HOST` de Mobiliza). No se migra el schema ni se crea uno
  propio — solo para inicio/fin/coords.
- **El gap real del sistema actual** (`PUT /Mobiliza/visita` recibe `motivos`/`resultado` del
  frontend pero no los persiste — por eso hoy redirigen al vendedor a Cromo a mano) se resuelve
  automatizando el envío a Cromo al cerrar la visita, NO agregando persistencia de motivos en
  MySQL. No existe una tabla `Motivos_visitas` en este diseño.
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
- **La vista semanal completa NO consulta el estado de visitas** (evita ~40 consultas por carga de
  pantalla). Solo la vista diaria (∼8 clientes) lo hace.
- **No se editan/reabren visitas ya cerradas.** Si el vendedor necesita corregir algo, se genera
  una visita nueva de ajuste.
- **Reagendar no mueve estructuralmente al cliente de día** — es informativo/histórico.

## Fuera de alcance (no implementar salvo pedido explícito)

Cumplimiento de objetivo/ranking de vendedores, novedades para el vendedor, link de WhatsApp al
cliente, pantalla de control de cumplimiento minuto a minuto (vista supervisor), recorrido/trazo
continuo de la visita o del día (requiere Capacitor + plugin nativo), migración del dashboard de
efectividad de app-mobiliza. Están en el backlog v2 del spec, no en este MVP.
