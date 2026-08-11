# Vista de gerencia para editar la rotación de un vendedor

**Fecha:** 2026-08-11
**Estado:** aprobado

## Problema

Hoy solo el propio vendedor puede reacomodar su rotación (`PATCH /planificacion/rotacion-cliente/:id/reacomodar`,
self-service vía `resolveSellerCode(user)`). No existe ninguna vista, rol habilitado, ni endpoint
para que gerencia (`admin` / `supervisor` / `versus-ger`) vea o modifique el recorrido de un
vendedor puntual — ni la rotación en curso, ni una futura.

El repo backend (`api-vendedores`, rama `MatiasH11/plan-rotacion-editable`) ya migró la asignación
cliente→sNdM a un modelo materializado y editable (`pl_rotacion_cliente`, ver
`docs/db-notes/planificacion-migracion-rotacion.sql` en ese repo) con la intención explícita de que
"gerencia reacomoda" (comentario en `RotacionService.ts`), pero esa pantalla y esos permisos
("spec 2") nunca se escribieron. Esto los define.

## Contexto que fija el diseño

- **El template del warehouse se lee una única vez por rotación**, al materializarla. De ahí en
  más el plan vive solo en `pl_rotacion_cliente` y es editable localmente — un cambio posterior en
  el Excel/warehouse no impacta esa rotación, solo la próxima que se materialice.
- **El modelo actual asume una sola rotación viva por vendedor** (`pl_rotacion`, `UNIQUE` sobre
  `fecha_fin IS NULL`), creada reactivamente recién cuando la anterior cierra. No hay hoy ningún
  campo de secuencia ni estado "programada". Este spec extiende ese modelo (ver más abajo).
- **`notas`/"Planning" (tabla `Notas`) es un dominio hermano no relacionado** — pools de Sequelize
  separados (`sequelizeWrite` vs `sequelizeWritePlanificacion`), rutas hermanas bajo `/vs/` sin
  solapamiento. Los roles `admin`/`supervisor`/`versus-ger` sí son compartidos a nivel de
  autenticación, pero su significado en `ROLE_POLICIES` (Notas) es específico de ese dominio y no
  se reusa acá: `planificacion` define su propio chequeo de acceso, independiente.
- Los tres roles (`admin`, `supervisor`, `versus-ger`) tienen **permiso completo por igual** sobre
  este dominio — sin la distinción más fina que existe en Notas (`canManageNotasEntidad`).

## Alcance

**Entra:**

- Vista nueva de gerencia: elegir un vendedor, ver su rotación completa (todas las semanas, no
  solo la abierta), y reacomodar clientes de día/semana por drag and drop.
- Planificar por adelantado: crear una o más rotaciones **programadas** (no vigentes todavía) para
  un vendedor, con orden explícito entre ellas, editarlas antes de que arranquen, reordenar la cola
  y cancelar una programada.
- Extensión del modelo `pl_rotacion` en `api-vendedores` para soportar esa cola (detallado abajo).
- Bitácora: todo reacomodo de gerencia queda en `pl_reacomodacion` con `origen='gerencia'` (la
  columna ya existe, hoy solo se escribe `'vendedor'`) **y con el usuario autenticado que lo hizo**
  (falta agregar esa columna — ver Modelo de datos).
- Descripción editable de una rotación completa (ej. "Ronda Agosto") y de cada semana dentro de
  ella (ej. "Semana Buenos Aires") — las semanas de una rotación suelen corresponder a una zona, y
  hoy solo se identifican por número.

**No entra (fuera de esta entrega):**

- Reporte de excepciones repetidas / detección de reacomodos abusivos sobre `pl_reacomodacion`
  (mencionado como "spec 2" en los comentarios SQL del backend) — entrega futura separada.
- Editar la plantilla cruda que llega del warehouse (el campo `visita`/sNdM del cliente) — eso
  sigue siendo responsabilidad de otra área sobre el Excel/warehouse. Gerencia edita el plan **ya
  materializado**, nunca la fuente.
- Scoping por zona/región dentro de los roles de gerencia — los tres roles ven y editan cualquier
  vendedor sin restricción, igual que ya ocurre en Analítica.
- Uso mobile de esta vista — diseñada desktop-first (drag and drop), sin adaptación táctil.

## Diseño

### 1. Navegación y ruta (front)

Nueva pestaña **"Ruta"**, última en `AnaliticaTabs.tsx`, junto a "Analítica de visitas" y
"Actividad":

```tsx
<NavLink to="/analitica/ruta">Ruta</NavLink>
```

Ruta `/analitica/ruta` dentro del mismo `<Route element={<ProtectedRoute permitirRol={esRolAnalitica} />}>`
que ya cubre `admin`/`supervisor`/`versus-ger` — no hace falta un rol nuevo.

Página nueva `RutaPage.tsx`, mismo shell que `AnaliticaPage`/`AnaliticaActividadPage` (header con
`AnaliticaTabs` + `AccountMenu`), pero sin `FiltrosAnalitica` (ese es de rango de fechas +
multi-vendedor, pensado para reportes). En su lugar: un selector de vendedor single-select
(reusa el roster de `useVendedores()` si el dataset sirve; si no, uno propio) y, debajo, la cola de
rotaciones de ese vendedor.

### 2. Modelo de datos — extensión de `pl_rotacion` (backend, `api-vendedores`)

```sql
-- ① Columnas nuevas SIN default ciego — fecha_inicio pasa a ser nullable porque
--   una 'programada' todavía no tiene fecha de arranque (se activa cuando la
--   anterior cierra en la realidad, no en una fecha calendario conocida de antemano).
ALTER TABLE pl_rotacion
  ADD COLUMN estado ENUM('programada','abierta','cerrada','cancelada') NULL,
  ADD COLUMN orden INT NULL,
  ADD COLUMN descripcion VARCHAR(120) NULL,
  MODIFY COLUMN fecha_inicio DATETIME NULL;

-- ② Backfill de las filas existentes ANTES de exigir NOT NULL — un DEFAULT ciego
--   marcaría también las rotaciones cerradas históricas como 'abierta' y rompería
--   la UNIQUE de abajo (colisión contra la abierta real del mismo vendedor).
UPDATE pl_rotacion SET estado = IF(fecha_fin IS NULL, 'abierta', 'cerrada');

ALTER TABLE pl_rotacion MODIFY COLUMN estado
  ENUM('programada','abierta','cerrada','cancelada') NOT NULL;

-- ③ Reemplaza la UNIQUE actual basada en fecha_fin IS NULL:
ALTER TABLE pl_rotacion DROP COLUMN vendedor_abierta;
ALTER TABLE pl_rotacion
  ADD COLUMN vendedor_abierta VARCHAR(50)
    AS (IF(estado = 'abierta', codigo_particular_vendedor, NULL)) STORED,
  ADD UNIQUE KEY uq_una_rotacion_abierta (vendedor_abierta);

ALTER TABLE pl_rotacion
  ADD UNIQUE KEY uq_orden_programada (codigo_particular_vendedor, orden);

-- Descripción por semana dentro de una rotación (suelen mapear a una zona).
-- Se crea una fila por semana al materializar (semana 1..N, descripcion NULL),
-- editable después por gerencia — independiente del ciclo real (pl_ciclo_semana),
-- que recién existe cuando esa semana se abre de verdad.
CREATE TABLE pl_rotacion_semana (
  rotacion_id INT NOT NULL,
  semana INT NOT NULL,
  descripcion VARCHAR(120) NULL,
  PRIMARY KEY (rotacion_id, semana),
  CONSTRAINT fk_rs_rotacion FOREIGN KEY (rotacion_id) REFERENCES pl_rotacion (id)
);

-- Quién hizo cada reacomodo, no solo el origen.
ALTER TABLE pl_reacomodacion
  ADD COLUMN actor_user_id INT NOT NULL,
  ADD COLUMN actor_nombre VARCHAR(120) NOT NULL;
```

- `'programada'`: creada por gerencia, todavía no vigente, `fecha_inicio` **NULL** (no se sabe
  cuándo va a arrancar — depende de cuándo cierre en la realidad la rotación anterior, no es una
  fecha calendario fija), `orden` define su posición en la cola (1 = la próxima a activarse).
- `'abierta'`: la única vigente por vendedor (mismo invariante de hoy, ahora expresado vía `estado`
  en vez de `fecha_fin IS NULL`).
- `'cerrada'`: ya vivida — no editable (`409 ROTACION_CERRADA` si se intenta reacomodar o
  cancelar).
- `'cancelada'`: soft-delete de una programada — preserva la fila para no romper la FK de
  `pl_reacomodacion`, pero `asegurarRotacion()` la ignora al buscar `MIN(orden)`.

`asegurarRotacion()` cambia: al detectar que no hay ninguna `'abierta'`, primero busca la
`'programada'` de menor `orden` para ese vendedor y la activa (`estado='abierta'`,
`fecha_inicio=NOW()`, dentro de una transacción para evitar carreras con la cola). Solo si no
hay ninguna programada, cae al comportamiento actual: crea una rotación nueva leyendo el template
del warehouse en ese instante.

`pl_rotacion_cliente` no cambia de forma — sigue colgando de `rotacion_id`, así que una fila
`'programada'` se materializa y se reacomoda con el mismo mecanismo que la abierta.

**El template se lee al crear la programada, no al activarse** — mismo principio que ya rige hoy
("es el único momento en que se lee el template"): gerencia planifica sobre una foto tomada al
crear la rotación; cambios posteriores en el warehouse no la afectan retroactivamente.

### 3. Contrato de API (backend)

Prefijo nuevo `/planificacion/vendedores/:codigo/...`, hermano de las rutas de self-service
existentes (que no se tocan). Todas exigen rol `admin`/`supervisor`/`versus-ger`.

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/planificacion/vendedores` | Roster de vendedores (reusar el de Analítica si el dataset alcanza). |
| `GET` | `/planificacion/vendedores/:codigo/rotaciones` | Lista la abierta + las programadas en orden. |
| `POST` | `/planificacion/vendedores/:codigo/rotaciones` | Crea una programada al final de la cola, materializa contra el template actual. Devuelve `omitidos` si hay clientes sin asignación sNdM. |
| `GET` | `/planificacion/vendedores/:codigo/rotaciones/:rotacionId` | Grid completo de esa rotación: todas sus semanas × 5 días × clientes, en un solo payload, con la `descripcion` de la rotación y de cada semana. |
| `PATCH` | `/planificacion/vendedores/:codigo/rotaciones/:rotacionId/rotacion-cliente/:id/reacomodar` | `UPDATE (semana, dia)` de esa fila. `409 ROTACION_CERRADA` si `estado='cerrada'`. Escribe `pl_reacomodacion` con `origen='gerencia'`, `actorUserId`/`actorNombre` del token. |
| `PATCH` | `/planificacion/vendedores/:codigo/rotaciones/:rotacionId/orden` | Reordena una programada dentro de la cola. `409` si ya se activó. |
| `DELETE` | `/planificacion/vendedores/:codigo/rotaciones/:rotacionId` | Cancela una programada (soft-delete, `estado='cancelada'`). `409 ROTACION_CERRADA`/`ROTACION_ABIERTA` si no aplica. |
| `PATCH` | `/planificacion/vendedores/:codigo/rotaciones/:rotacionId` | Edita `descripcion` de la rotación completa. |
| `PATCH` | `/planificacion/vendedores/:codigo/rotaciones/:rotacionId/semanas/:semana` | Edita `descripcion` de esa semana puntual (ej. "Buenos Aires"). No requiere que la semana ya tenga un ciclo abierto. |

El endpoint de reacomodar de **self-service** (`PATCH /planificacion/rotacion-cliente/:id/reacomodar`,
el del vendedor) también pasa a grabar `actorUserId`/`actorNombre` — así "quién hizo el cambio" queda
resuelto para ambos orígenes, no solo para gerencia.

### 4. Tipos y hooks (front)

```ts
export type EstadoRotacion = 'programada' | 'abierta' | 'cerrada' | 'cancelada'

export interface ISemanaRotacion {
    semana: number
    estado: EstadoCiclo | 'futura'
    descripcion: string | null
    dias: Record<Dia, IAgendaClient[]>
}

export interface IRotacionResumen {
    id: number
    estado: EstadoRotacion
    orden: number | null
    fechaInicio: string | null
    descripcion: string | null
}

export interface IRotacionCompleta extends IRotacionResumen {
    semanas: ISemanaRotacion[]
    omitidos?: string[]
}

/** Quién movió una fila por última vez — se muestra como detalle en la card, no como reporte. */
export interface IReacomodacionInfo {
    origen: 'vendedor' | 'gerencia'
    actorNombre: string
    fecha: string
}
```

Reusa `IAgendaClient` tal cual para las cards en cuanto a datos del cliente/visita, pero en el grid
de gerencia cada card viaja con un campo extra, no presente en la agenda del vendedor:

```ts
export interface IAgendaClientAdmin extends IAgendaClient {
    ultimoMovimiento: IReacomodacionInfo | null
}
```

`src/api/planificacionAdmin.ts` (nuevo, separado de `src/api/planificacion.ts` que es self-service):
`getVendedores`, `getRotaciones(codigo)`, `crearRotacion(codigo)`, `getRotacion(codigo, rotacionId)`,
`reacomodar(codigo, rotacionId, rotacionClienteId, dto)`, `reordenar(codigo, rotacionId, orden)`,
`cancelarRotacion(codigo, rotacionId)`, `editarDescripcionRotacion(codigo, rotacionId, descripcion)`,
`editarDescripcionSemana(codigo, rotacionId, semana, descripcion)`.

`src/hooks/useRotacionAdmin.ts`, patrón React Query: `useVendedoresRoster`, `useRotaciones(codigo)`,
`useRotacion(codigo, rotacionId)`, `useCrearRotacion`, `useReacomodarAdmin`, `useReordenarRotacion`,
`useCancelarRotacion`, `useEditarDescripcionRotacion`, `useEditarDescripcionSemana` — cada mutation
invalida `useRotaciones`/`useRotacion` según corresponda.

### 5. UI — cola de rotaciones + grid

- Fila de chips horizontal debajo del selector de vendedor: cada chip muestra la `descripcion` de
  la rotación si tiene una (ej. "Ronda Agosto"), o "Actual"/"Programada #N" si no. El chip de la
  abierta no se puede cancelar ni reordenar; los de programadas sí (drag del chip mismo para
  reordenar). Un ícono de lápiz al lado del chip activo abre un input inline para editar/asignar
  su descripción (`useEditarDescripcionRotacion`).
- Click en un chip carga su grid: filas = semanas, columnas = LUN–VIE. Cada fila de semana muestra
  su número **y** su `descripcion` si la tiene (ej. "Semana 2 — Buenos Aires"), con el mismo lápiz
  inline para editarla/asignarla (`useEditarDescripcionSemana`) aunque esa semana todavía no se
  haya abierto como ciclo real.
- Celdas con cards de cliente (reusa `ClienteCard` o una versión compacta). Al hacer hover/tap
  sobre una card se ve quién la movió por última vez y cuándo (`ultimoMovimiento`) — solo como dato
  visible en la card, no como pantalla de reporte aparte (eso queda fuera de esta entrega).
- Arrastrar una card de una celda a otra dispara `reacomodar` con el `{semana, dia}` de la celda
  destino.
- `+ Agregar rotación` dispara `crearRotacion`, agrega el chip al final y abre su grid
  automáticamente. Si vuelve `omitidos`, se muestra como aviso no bloqueante.
- Librería nueva: **`@dnd-kit/core`** — no hay ninguna lib de drag and drop en el repo hoy.

### 6. Errores y casos borde

- Reacomodar/cancelar/reordenar sobre `'cerrada'` → `409 ROTACION_CERRADA`.
- Reordenar una fila que ya se activó (pasó a `'abierta'`) entre que el front pidió la cola y
  mandó el `PATCH` → `409`, el front refresca la cola.
- Carrera entre `asegurarRotacion()` activando la próxima programada y gerencia reordenando la
  cola al mismo tiempo: se resuelve con transacción en el `UPDATE estado` de activación —
  last-write-consistent, sin optimistic locking en el front.
- Gerencia y vendedor reacomodando la misma fila a la vez: sin bloqueo especial, último `UPDATE`
  gana — igual que cualquier otro `PATCH` de este dominio hoy.
- Vendedor sin ninguna rotación materializada: mismo patrón de estado vacío que ya usa Analítica
  ("No hay ciclos entre..."), con `+ Agregar rotación` igual disponible para materializar la
  primera.

### 7. Testing

Vitest sobre los hooks nuevos con `api` mockeado (mismo patrón que `usePropuesta`). Para el grid
con `@dnd-kit`, tests de componente que simulan `onDragEnd` y verifican que dispara la mutation
correcta con `{semana, dia}` — sin necesidad de simular gestos de puntero reales.

## Preguntas abiertas para el equipo de backend

- Confirmar si el roster de `GET /planificacion/vendedores` puede reusar el dataset que ya expone
  Analítica, o si necesita un endpoint propio dentro de `planificacion`.
- Confirmar de dónde sale `actorUserId` — si el token ya trae un id de usuario numérico utilizable
  como FK, o si `pl_reacomodacion.actor_user_id` debe apuntar a otra tabla de usuarios existente en
  el sistema (a revisar contra el modelo de auth real de `api-vendedores`).
