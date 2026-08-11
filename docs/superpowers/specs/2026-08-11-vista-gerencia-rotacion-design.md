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

- **El modelo de rotación todavía NO está en producción.** `pl_rotacion`, `pl_rotacion_cliente` y
  `pl_reacomodacion` no existen en `origin/master` — nacen en la rama
  `MatiasH11/plan-rotacion-editable`, sin deployar. Producción hoy tiene el modelo viejo
  (`pl_ciclo_semana` + `pl_ciclo_cliente`), y `planificacion-migracion-rotacion.sql` es la migración
  pendiente que lo reemplaza. **Consecuencia para este spec: los cambios de esquema se plegan a ese
  DDL pendiente, no se agregan como una segunda migración con backfill encima.** Un `ALTER TABLE`
  posterior sería complejidad gratuita contra tablas que todavía no tienen una sola fila en prod.
- **El template del warehouse se lee una única vez por rotación**, al materializarla. De ahí en
  más el plan vive solo en `pl_rotacion_cliente` y es editable localmente — un cambio posterior en
  el Excel/warehouse no impacta esa rotación, solo la próxima que se materialice.
- **El modelo actual asume una sola rotación viva por vendedor** (`pl_rotacion`, invariante
  garantizado por una columna generada + `UNIQUE uq_una_rotacion_abierta`), creada reactivamente
  recién cuando la anterior cierra. No hay hoy campo de secuencia ni estado "programada". Este spec
  extiende ese modelo.
- **La autoría del reacomodo YA se persiste.** `pl_reacomodacion` ya tiene
  `usuario VARCHAR(100) NOT NULL` y `VisitasService.ts:209` ya graba `user.email ?? String(user.id)`.
  No hace falta ninguna columna nueva para "quién hizo el cambio" — falta solo **exponerla** en la
  API y mostrarla en la UI. Tampoco es viable una FK a usuarios: viven en un servicio de auth
  externo (`authService` consulta `/api/auth/me`), no hay tabla de usuarios en la base
  `planificacion`.
- **`notas`/"Planning" (tabla `Notas`) es un dominio hermano no relacionado** — pools de Sequelize
  separados (`sequelizeWrite` vs `sequelizeWritePlanificacion`), rutas hermanas bajo `/vs/` sin
  solapamiento. Los roles `admin`/`supervisor`/`versus-ger` son compartidos a nivel de
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
- Extensión del modelo `pl_rotacion` para soportar esa cola, plegada al DDL pendiente.
- Exponer y mostrar la autoría de cada reacomodo: `origen` (`'vendedor'`/`'gerencia'`) y `usuario`,
  ambos ya persistidos. Gerencia escribe `origen='gerencia'` (hoy solo se escribe `'vendedor'`).
- Descripción editable de una rotación completa (ej. "Ronda Agosto") y de cada semana dentro de
  ella (ej. "Semana Buenos Aires") — las semanas suelen corresponder a una zona, y hoy solo se
  identifican por número. La descripción de semana se hereda a la rotación siguiente.

**No entra (fuera de esta entrega):**

- Reporte de excepciones repetidas / detección de reacomodos abusivos sobre `pl_reacomodacion`
  (mencionado como "spec 2" en los comentarios SQL del backend) — entrega futura separada.
- Editar la plantilla cruda que llega del warehouse (el campo `visita`/sNdM del cliente) — eso
  sigue siendo responsabilidad de otra área. Gerencia edita el plan **ya materializado**, nunca la
  fuente.
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

Ruta `/analitica/ruta` dentro del mismo `ProtectedRoute` que ya cubre los tres roles de gerencia.

**Refactor menor incluido:** `src/lib/roles.ts` expone hoy `ROLES_ANALITICA` / `esRolAnalitica`,
pero esa lista es en realidad "los roles de scope `unrestricted`" y ahora va a guardar una ruta que
no es analítica. Se renombran a `ROLES_GERENCIA` / `esRolGerencia` (mismo contenido, mismos tres
roles) y se actualizan sus usos en `App.tsx` y `rutaInicialPara`.

Página nueva `RutaPage.tsx`, mismo shell que `AnaliticaPage`/`AnaliticaActividadPage` (header con
`AnaliticaTabs` + `AccountMenu`), pero sin `FiltrosAnalitica` (ese es de rango de fechas +
multi-vendedor, para reportes). En su lugar: un selector de vendedor single-select y, debajo, la
cola de rotaciones de ese vendedor.

### 2. Modelo de datos (backend, `api-vendedores`)

Todo esto se escribe **dentro del DDL pendiente** (`planificacion-migracion-rotacion.sql` y
`planificacion-ciclo-tables.sql`), no como `ALTER TABLE` posterior. No hay backfill: cuando esa
migración corra, crea las filas ya con el `estado` correcto.

```sql
-- pl_rotacion, con las columnas de la cola incluidas de entrada.
CREATE TABLE pl_rotacion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo_particular_vendedor VARCHAR(50) NOT NULL,
  estado ENUM('programada','abierta','cerrada','cancelada') NOT NULL,
  -- NULL mientras está 'programada': no se sabe cuándo va a arrancar (depende de
  -- cuándo cierre la anterior en la realidad, no es una fecha calendario fija).
  fecha_inicio DATETIME NULL,
  fecha_fin DATETIME NULL,
  descripcion VARCHAR(120) NULL,          -- ej. "Ronda Agosto"
  -- Posición en la cola de programadas de ese vendedor. NULL en cualquier otro
  -- estado: al activarse o cancelarse se limpia, así una cancelada no deja un
  -- hueco reservado para siempre.
  orden INT NULL,
  vendedor_abierta VARCHAR(50)
    AS (IF(estado = 'abierta', codigo_particular_vendedor, NULL)) STORED,
  UNIQUE KEY uq_una_rotacion_abierta (vendedor_abierta)
  -- SIN unique sobre (vendedor, orden): intercambiar dos posiciones violaría la
  -- constraint a mitad de transacción y MySQL no tiene constraints deferidas.
  -- La unicidad del orden la garantiza el service renumerando la cola completa.
);

-- El SET DE SEMANAS de la rotación, explícito. Reemplaza al
-- `SELECT DISTINCT semana FROM pl_rotacion_cliente` de RotacionClienteRepository
-- (ver "Cambio de comportamiento" abajo). Se puebla al materializar.
CREATE TABLE pl_rotacion_semana (
  rotacion_id INT NOT NULL,
  semana TINYINT NOT NULL,
  descripcion VARCHAR(120) NULL,          -- ej. "Buenos Aires"
  PRIMARY KEY (rotacion_id, semana),
  CONSTRAINT fk_rs_rotacion FOREIGN KEY (rotacion_id) REFERENCES pl_rotacion (id),
  CONSTRAINT ck_rs_semana CHECK (semana >= 1)
);
```

`pl_reacomodacion` **no cambia**: `usuario VARCHAR(100) NOT NULL` y `origen VARCHAR(20) NOT NULL`
ya cubren la autoría.

Estados:

- `'programada'`: creada por gerencia, todavía no vigente, `fecha_inicio` NULL, `orden` = su
  posición en la cola (1 = la próxima a activarse).
- `'abierta'`: la única vigente por vendedor (mismo invariante de hoy, ahora expresado vía `estado`
  en vez de `fecha_fin IS NULL`), `orden` NULL.
- `'cerrada'`: ya vivida — no editable (`409 ROTACION_CERRADA`).
- `'cancelada'`: soft-delete de una programada — preserva la fila para no romper la FK de
  `pl_reacomodacion`, con `orden` NULL para no bloquear la cola.

#### Cambios en código existente que esto obliga

Son pocos y hay que hacerlos todos, si no la extensión rompe el flujo del vendedor:

1. **`RotacionRepository.findAbiertaByVendedor`** (`:16`) filtra por `fechaFin: null`. Pasa a
   filtrar por `estado: 'abierta'` — si no, una `'programada'` (que también tiene `fecha_fin` NULL)
   se devolvería como la rotación vigente del vendedor. Es el único lugar del repo que consulta
   apertura de `pl_rotacion`; sus 8 call sites (`CicloService:216`, `RotacionService:39,103`,
   `RubrosService:121`, `VisitasService:182,304,401`) no cambian.
2. **`RotacionRepository.cerrar`** (`:39`) escribe `fechaFin`; ahora además `estado='cerrada'`.
3. **`toIRotacion`** (`:72`) hace `r.fechaInicio.toISOString()` sin guard, y
   `IRotacion.fechaInicio` es `string` no-nullable. Con `fecha_inicio` nullable ambos rompen: el
   tipo pasa a `string | null` y el mapeo necesita el guard.
4. **`RotacionClienteRepository.semanasDelSet`** (`:105-117`) pasa a leer `pl_rotacion_semana` en
   vez de `SELECT DISTINCT semana FROM pl_rotacion_cliente`.

**Cambio de comportamiento (deliberado):** hoy el set de semanas se deriva de las filas de
clientes, así que mover el último cliente fuera de una semana hace desaparecer esa semana de la
rotación. Con el set explícito, la semana sigue existiendo (vacía) y conserva su descripción. Es
además lo que habilita nombrar una semana antes de que tenga clientes, y cierra el agujero de
validación del punto siguiente.

### 3. Validación de `semana` al reacomodar

Hoy `semana: 99` pasa `parseSemana` (solo exige entero ≥ 1) y muere recién en el 422
`SEMANA_FUERA_DEL_SET` de `VisitasService.ts:191-200` — que **solo corre si `dto.semana !== undefined`**.
`RotacionClienteRepository.mover()` no revalida, y el CHECK de la tabla solo pide `semana >= 1`
(`TINYINT`, techo 127). `dia` sí está acotado a 1..5 por CHECK.

Por eso el endpoint de gerencia **no llama a `mover()` directo**: pasa por la misma validación de
pertenencia al set (ahora contra `pl_rotacion_semana`, que es autoritativo). El drag and drop solo
puede soltar en celdas que existen en el grid, pero la API no puede confiar en eso.

### 4. Contrato de API (backend)

Prefijo `/planificacion/vendedores/:codigo/...`, hermano de las rutas de self-service existentes
(que no se tocan). Todas con `authorize(...ROLES_GERENCIA)` — la firma real es variádica
(`authorize = (...allowedRoles: string[])`, `middleware/authorize.ts:8`), **no acepta un array**;
el patrón ya está en uso en `routes/analitica.ts:14`.

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/planificacion/vendedores/:codigo/rotaciones` | Lista la abierta + las programadas en orden. |
| `POST` | `/planificacion/vendedores/:codigo/rotaciones` | Crea una programada al final de la cola, materializa contra el template actual. Devuelve `omitidos` si hay clientes sin asignación sNdM. |
| `GET` | `/planificacion/vendedores/:codigo/rotaciones/:rotacionId` | Grid completo: semanas × días × clientes en un solo payload, con las descripciones y el último movimiento de cada fila. |
| `PATCH` | `/planificacion/vendedores/:codigo/rotaciones/:rotacionId/rotacion-cliente/:id/reacomodar` | `UPDATE (semana, dia)`. Valida pertenencia al set (§3). `409 ROTACION_CERRADA`, `409 FILA_RESUELTA` (ya existe en `mover()`). Graba `pl_reacomodacion` con `origen='gerencia'` y `usuario`. |
| `PATCH` | `/planificacion/vendedores/:codigo/rotaciones/:rotacionId/orden` | Mueve una programada a otra posición; el service **renumera la cola completa** en una transacción. `409` si ya se activó. |
| `DELETE` | `/planificacion/vendedores/:codigo/rotaciones/:rotacionId` | Cancela una programada (`estado='cancelada'`, `orden=NULL`). `409 ROTACION_CERRADA`/`ROTACION_ABIERTA` si no aplica. |
| `PATCH` | `/planificacion/vendedores/:codigo/rotaciones/:rotacionId` | Edita `descripcion` de la rotación. |
| `PATCH` | `/planificacion/vendedores/:codigo/rotaciones/:rotacionId/semanas/:semana` | Edita `descripcion` de esa semana. No requiere que la semana tenga un ciclo abierto ni clientes. |

**Roster de vendedores: no hace falta endpoint nuevo.** Ya existe
`GET /planificacion/analitica/vendedores`, consumido por `getVendedores` (`src/api/analitica.ts:148`)
vía el hook `useVendedores()`. Se reusa tal cual.

El endpoint de reacomodar de self-service también pasa a exponer `origen`/`usuario` en la lectura;
la escritura ya los graba.

### 5. Herencia de la descripción de semana

Al materializar una rotación nueva para un vendedor, las filas de `pl_rotacion_semana` copian la
`descripcion` de la última rotación de ese vendedor que tuviera esa misma semana. Motivo: las
semanas mapean a zonas y la zona es estable — sin herencia, gerencia tendría que re-escribir
"Buenos Aires" en cada rotación. Sigue siendo editable después, y una semana que no existía en la
rotación anterior nace con `descripcion` NULL.

### 6. Tipos y hooks (front)

```ts
export type EstadoRotacion = 'programada' | 'abierta' | 'cerrada' | 'cancelada'

/** Quién movió una fila por última vez. Ambos campos ya se persisten en pl_reacomodacion. */
export interface IReacomodacionInfo {
    origen: 'vendedor' | 'gerencia'
    usuario: string
    fecha: string
}

/** La card del grid de gerencia: los mismos datos que ve el vendedor, más la autoría. */
export interface IAgendaClientAdmin extends IAgendaClient {
    ultimoMovimiento: IReacomodacionInfo | null
}

export interface ISemanaRotacion {
    semana: number
    estado: EstadoCiclo | 'futura'
    descripcion: string | null
    dias: Record<Dia, IAgendaClientAdmin[]>
}

export interface IRotacionResumen {
    id: number
    estado: EstadoRotacion
    /** Posición en la cola; null salvo en 'programada'. */
    orden: number | null
    /** null mientras está 'programada'. */
    fechaInicio: string | null
    descripcion: string | null
}

export interface IRotacionCompleta extends IRotacionResumen {
    semanas: ISemanaRotacion[]
    omitidos?: string[]
}
```

`src/api/planificacionAdmin.ts` (nuevo, separado de `src/api/planificacion.ts` que es self-service):
`getRotaciones(codigo)`, `crearRotacion(codigo)`, `getRotacion(codigo, rotacionId)`,
`reacomodar(codigo, rotacionId, rotacionClienteId, dto)`, `reordenar(codigo, rotacionId, orden)`,
`cancelarRotacion(codigo, rotacionId)`, `editarDescripcionRotacion(...)`,
`editarDescripcionSemana(...)`. El roster sale de `useVendedores()`, que ya existe.

`src/hooks/useRotacionAdmin.ts`, patrón React Query: `useRotaciones(codigo)`,
`useRotacion(codigo, rotacionId)`, `useCrearRotacion`, `useReacomodarAdmin`, `useReordenarRotacion`,
`useCancelarRotacion`, `useEditarDescripcionRotacion`, `useEditarDescripcionSemana` — cada mutation
invalida `useRotaciones`/`useRotacion` según corresponda.

### 7. UI — cola de rotaciones + grid

- Fila de chips debajo del selector de vendedor: cada chip muestra la `descripcion` de la rotación
  si tiene una (ej. "Ronda Agosto"), o "Actual"/"Programada #N" si no. El chip de la abierta no se
  puede cancelar ni reordenar; los de programadas sí (drag del chip para reordenar). Un lápiz al
  lado del chip activo abre un input inline para su descripción.
- Click en un chip carga su grid: filas = semanas, columnas = LUN–VIE. Cada fila muestra número
  **y** descripción (ej. "Semana 2 — Buenos Aires"), con lápiz inline, incluso si la semana está
  vacía o todavía no se abrió como ciclo.
- **Card propia, no `ClienteCard`.** La card de la agenda exige cuatro callbacks del flujo de
  visita (`onAbrir`, `onEstadoVisita`, `onIniciarVisita`, `onAbrirAppExterna`) que gerencia no
  tiene: no inicia visitas ni abre apps externas. Se crea un componente nuevo, compacto, con
  nombre/código del cliente, su estado, y el último movimiento (`ultimoMovimiento`: quién lo movió
  y cuándo) visible en hover.
- Arrastrar una card entre celdas dispara `reacomodar` con el `{semana, dia}` destino. Una fila con
  visita ya resuelta rebota con `409 FILA_RESUELTA` (validación que ya existe en `mover()`).
- `+ Agregar rotación` dispara `crearRotacion`, agrega el chip al final y abre su grid. Si vuelve
  `omitidos`, se muestra como aviso no bloqueante.
- Librería nueva: **`@dnd-kit/core`** — no hay ninguna lib de drag and drop en el repo hoy.

### 8. Errores y casos borde

- Reacomodar/cancelar/reordenar sobre `'cerrada'` → `409 ROTACION_CERRADA`.
- Reordenar una programada que ya se activó entre el `GET` y el `PATCH` → `409`, el front refresca.
- Carrera entre `asegurarRotacion()` activando la próxima programada y gerencia reordenando: el
  `UPDATE` de activación va en transacción, tomando `MIN(orden)` entre las `'programada'`.
- Gerencia y vendedor reacomodando la misma fila a la vez: sin bloqueo especial, último `UPDATE`
  gana — igual que cualquier otro `PATCH` de este dominio hoy.
- Vendedor sin ninguna rotación: estado vacío con `+ Agregar rotación` disponible. La programada
  que se cree se activa sola cuando el vendedor opere (`asegurarRotacion()` no encuentra abierta y
  toma la de menor `orden`).
- `IUser.id` llega como **string** (`authService.ts:29` hace `.toString()`), y hay `name` +
  `surname` separados. El precedente ya establecido para `usuario` es `user.email ?? String(user.id)`
  — se mantiene, no se inventa otro formato.

### 9. `asegurarRotacion()` — activación en cadena

Al detectar que no hay ninguna `'abierta'`, busca la `'programada'` de menor `orden` de ese
vendedor y la activa (`estado='abierta'`, `fecha_inicio=NOW()`, `orden=NULL`) en una transacción.
Solo si no hay ninguna programada cae al comportamiento actual: crear una rotación nueva leyendo el
template del warehouse en ese instante.

El template se lee **al crear la programada**, no al activarse — mismo principio que ya rige
("es el único momento en que se lee el template"): gerencia planifica sobre una foto tomada al
crear la rotación, y cambios posteriores en el warehouse no la afectan retroactivamente.

### 10. Testing

**Front:** Vitest sobre los hooks nuevos con `api` mockeado (patrón de `usePropuesta`). Para el
grid, tests de componente que simulan `onDragEnd` y verifican que dispara la mutation con
`{semana, dia}` correcto — sin simular gestos de puntero reales.

**Backend:** los casos que no cubre ningún test hoy y que este spec introduce:

- `findAbiertaByVendedor` con una `'programada'` presente **no** la devuelve (la regresión más
  peligrosa del cambio de invariante).
- `asegurarRotacion()` activa la programada de menor `orden` y no crea una rotación nueva; con la
  cola vacía sí la crea.
- Reordenar renumera la cola sin colisiones; cancelar libera el `orden`.
- Reacomodar a una semana fuera de `pl_rotacion_semana` rebota 422.
- `toIRotacion` con `fecha_inicio` NULL no explota.
- El DDL modificado corre limpio contra el fixture que ya usa la migración pendiente.

## Preguntas abiertas

- Confirmar con el equipo de backend el orden de deploy: este spec modifica un DDL que todavía no
  salió a producción, así que conviene que ambas cosas viajen en la misma migración en vez de
  deployar la pendiente primero y alterarla después.
