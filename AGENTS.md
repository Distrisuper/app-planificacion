# AGENTS.md — app-planificacion

## Qué es

App web/PWA mobile-first (React) con la que el **vendedor** de DistriSuper planifica y ejecuta su ruta
de visitas (agenda semanal, propuesta comercial, iniciar/cerrar visita con GPS, "no visité") y con la
que **gerencia** mide cobertura y efectividad y edita la rotación (`/analitica/*`).
No tiene backend propio: consume **api-vendedores** (dominio `planificacion`, repo hermano) con
Bearer token. Deploy en Vercel desde `master`.

## Comandos

- `npm run check` — lo mismo que exige CI: `lint` (oxlint) + `tsc -b --noEmit` + `npm test`
  (Vitest) + `check:hooks` (tests del guard y del pre-push). Tiene que dar exit 0 antes del PR.
- `npm test` — Vitest (jsdom). `npx vitest run src/lib/fechas.test.ts` para un archivo.
- `npm run build` — `tsc -b && vite build` (CI también lo corre).
- `npm run dev` y `npm run e2e` (Playwright, levanta `npm run dev`) — solo si la persona lo pide:
  para verificar una tarea no hacen falta.

## Arquitectura

```
src/
  api/          clientes HTTP: apiClient.ts (axios, Bearer, 401 → limpia sesión), authApi.ts,
                planificacion.ts, planificacionAdmin.ts, analitica.ts
  hooks/        React Query por recurso (useAgenda, useVisitas, useCiclo, useFicha…): el estado
                de negocio vive acá, no en contextos
  components/   pantallas del vendedor (AgendaBoard, ClienteCard, VisitaFlow, VisitaSheet,
                MapaVisita…); subcarpetas analitica/, ruta/, propuesta/, relevamiento/,
                buscador/, prueba/, ui/ (Button, BottomSheet, ConfirmDialog…)
  pages/        una por ruta (AgendaSemanaPage, AnaliticaPage, RutaPage, LoginPage…)
  lib/          lógica pura y testeable (fechas, distancia, geolocation, roles, sesionLocal,
                estadoDuracion, descuentosMarca…)
  context/      AuthContext (único contexto)
  router/       ProtectedRoute (permite por capacidades)
  mocks/        analiticaMock.ts (fixture de analítica, VITE_ANALITICA_MOCK)
  types/        tipos de la API
e2e/            Playwright (no entra en check)
docs/dominio/   documentación viva del dominio y del front
```

Rutas en `src/App.tsx`: vendedor `/` y `/metricas`; gerencia `/analitica`, `/analitica/actividad`,
`/analitica/vendedor/:codigo`, `/analitica/ruta`, `/analitica/altas`, `/analitica/fichas`.
Variables `VITE_*` documentadas en `.env-example`; los tests usan `.env.test` (trackeado, valores
públicos) y Vitest fija `TZ=America/Argentina/Buenos_Aires` y `VITE_ANALITICA_MOCK=1`.

## Reglas no evidentes del dominio

Lo largo está en `docs/dominio/modelo.md` (plan, hecho, ciclo), `docs/dominio/tablas.md` (esquema) y
`docs/dominio/decisiones-front.md` (decisiones del front con su porqué). Leelos antes de tocar
agenda, visita, ciclo o resoluciones. Las que más se rompen:

1. **Plan, hecho y ciclo son capas separadas.** El plan (`pl_rotacion_cliente`) se puede mover;
   el hecho (`pl_resolucion`) es inmutable y pertenece a un cliente y un momento, no a un ciclo.
   Visitar hoy a un cliente de otra zona registra un hecho; no mueve el plan.
2. **"Pendiente" es ausencia de resolución, no `no_visita`.** Nunca auto-resolver pendientes ni
   exigir justificación. Reagendar mueve `(semana, dia)` y deja al cliente pendiente.
3. **El denominador son visitas planificadas, no clientes** (un quincenal aporta 2), y
   `resueltos / total` no es cumplimiento: `no_visita` no suma cobertura.
4. **El vendedor ve zonas, días y clientes, nunca ciclos ni rotaciones.** "Semana N" no es
   vocabulario suyo; el cierre de semana es automático (backend) e invisible.
5. **Iniciar visita exige ≤100 m del cliente; cerrar no tiene gate** (pero puede pedir
   confirmación en el mapa). Los gates del front que cuentan algo esperan a que el dato haya
   cargado: con el GET en vuelo, `min(2, 0)` se auto-satisface.
6. **Horas en TZ de negocio** con `horaNegocio` (`src/lib/fechas.ts`); nunca `slice` del ISO ni
   `toLocaleTimeString()` pelado.
7. **El front no tiene tabla de roles**: decide con las capacidades de `GET /planificacion/me`.
   Lo que falte (capacidad, endpoint, campo) se resuelve en api-vendedores; el warehouse no se
   modifica.
8. **Cerrar sesión limpia todo lo de la sesión** (`cerrarSesionLocal`): algo nuevo en storage que
   sea de la sesión va con prefijo `visita-` o se suma a esa función.

## Git y PR

- Rama base: **`master`** (cada merge despliega en Vercel). Nunca commitear ni pushear a `master`.
- Ramas `feature/<slug>` desde `master`.
- Commits `tipo(alcance): descripción` en español (`feat(visita): …`, `fix(analitica): …`).
- PR siempre **draft**, con la plantilla `.github/pull_request_template.md`. Nunca `gh pr ready`,
  merge ni aprobar: eso lo hace una persona.
- El pre-push rechaza cualquier push a `master` (para todos). Escape solo para una persona en su
  terminal: `ALLOW_BASE_PUSH=1 git push …`.
- El guard de Claude Code (`.claude/hooks/guard.cjs`, reglas en `docs/agentes/guard.md`) niega
  deploy, secretos, push a la base y editar el propio guard.

## Cómo se trabaja una tarea

Modo directo: del requerimiento al PR draft sin pedir aprobaciones intermedias.

1. Leé el código que toca la tarea. Las decisiones técnicas las tomás vos y las anotás en el PR.
2. Escribí primero los tests que prueban el "listo cuando" del requerimiento y miralos fallar.
   Pocos mocks: mockeá solo el borde (HTTP, base, reloj).
3. Implementá hasta que pasen. No levantes la app, docker ni bases para verificar: la verificación es
   `npm run check`.
4. No modifiques ni borres tests existentes para que pasen. Si un test existente estaba mal, el cambio
   va explicado en el PR.
5. Cerrá con la skill `pr` (check en verde, revisión del diff, PR draft con la plantilla).

Frená y preguntá antes de seguir solo si la tarea:
- cambia el contrato de un endpoint que consumen otros repos (este front no tiene endpoints: si
  hace falta cambiar uno de api-vendedores, es una tarea de ese repo; ver su sección "Consumidores"),
- toca migraciones, DDL o datos de producción,
- toca auth, roles, permisos o secretos,
- o el requerimiento es ambiguo en una regla de negocio (números, casos) que tendrías que inventar.

## Documentación vigente vs histórica

Vigente (si contradice al código, gana el código y se corrige el doc):
- `docs/dominio/modelo.md`, `docs/dominio/tablas.md`, `docs/dominio/decisiones-front.md`.
- `docs/agentes/guard.md` (guard y pre-push).
- El DDL consolidado vive en api-vendedores: `docs/db-notes/planificacion-ciclo-tables.sql`.

Histórica (el porqué de decisiones pasadas; **no** describe el estado actual ni es un flujo a
seguir):
- `docs/superpowers/specs/` y `docs/superpowers/plans/` (registro con fecha; varios fueron
  reemplazados y algunos describen tablas que ya no existen).
- `Prototipo/` (mockups iniciales; la UI cambió desde entonces), `Mocks/`, `Brainstorming.md`,
  `docs/examples/`.
- `README.md` es el de la plantilla de Vite.
