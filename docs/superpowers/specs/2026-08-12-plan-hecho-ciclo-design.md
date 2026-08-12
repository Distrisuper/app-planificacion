# Desacoplar el registro del hecho del ciclo

**Fecha:** 2026-08-12
**Estado:** ⛔ **REEMPLAZADO, no implementar.** Ver
[`2026-08-12-semana-hecha-cierre-invisible-design.md`](2026-08-12-semana-hecha-cierre-invisible-design.md),
que conserva el diagnóstico y cambia la solución.

> **Por qué se reemplazó.** Derivar "semana hecha" de las resoluciones (*hecha = sus filas del plan están
> resueltas*) tiene cuatro bloqueantes verificados contra el código: la rotación no vuelve a cerrarse
> nunca (y con ella se tranca la cola de programadas y el número que se reporta hacia arriba);
> `sincronizarPadron` empieza a mover el denominador de zonas ya recorridas; los rubros de una visita en
> una zona sin ciclo no los alcanza ningún cierre y las cargas pendientes pasan a dar 403; y sus piezas
> 2 y 3 se anulan entre sí. El detalle está en la sección "Por qué no la versión anterior" del spec que
> lo reemplaza. Lo que sí sobrevive: el diagnóstico, el `DROP INDEX uq_rotacion_semana` y la lista de
> borrado en el front.

> Este spec es el registro de una decisión, no documentación del sistema. El modelo del dominio y las
> tablas se describen en `docs/dominio/modelo.md` y `docs/dominio/tablas.md`, que son los documentos
> vivos. Si algo de acá quedó viejo, esos manda.

## El problema

Cerrar una semana es destructivo y volver a una zona ya recorrida es imposible. La causa es que el
ciclo (`pl_ciclo_semana`) hace tres trabajos y uno no le corresponde:

| trabajo | ¿le corresponde? |
|---|---|
| Decidir qué agenda mostrar (`AgendaService`) | Sí |
| Registrar cuándo recorrió la semana N | Sí — es su definición |
| Ser la fuente de "qué semanas están hechas" | **No.** Es una propiedad de las resoluciones |

Ese tercer trabajo se implementa así:

```sql
SELECT DISTINCT semana FROM pl_ciclo_semana WHERE rotacion_id = :rotacionId
```

Sin filtro por estado: una semana cuenta como hecha **desde que se abre**, no desde que se termina. Y
`UNIQUE (rotacion_id, semana)` impide un segundo ciclo para la misma semana.

**Y hay un guard cuya justificación ya caducó.** En `VisitasService.resolverFilaDelPlan`:

```ts
// Una fila real (con rotacionClienteId) no implica que el CICLO de su semana
// esté abierto: puede venir del preview de una semana que no es la actual, o
// de un standby donde nada se abrió todavía. Sin este `asegurar`, la visita se
// creaba igual (cuelga de la rotación, no del ciclo) pero cerrarla después
// tiraba CICLO_NO_ABIERTO, porque nunca se había abierto ningún
// pl_ciclo_semana en el camino.
await CicloService.asegurar(user, fila.semana, dto.confirmarCambioDeSemana)
```

El comentario confirma que **la visita se crea correctamente sin ciclo**. El guard está ahí por un
efecto colateral de `cerrarVisita` — y ese efecto ya se eliminó: `VisitasService.ts:382` documenta
*"Antes exigía `CicloService.requireCicloAbierto`, y eso rompía cerrar…"*. Hoy `requireCicloAbierto` lo
usa solo `AgendaService`, para decidir qué agenda leer.

Ese guard es el que dispara el `409 CAMBIO_DE_SEMANA`, y confirmarlo cierra la semana abierta.

## El cambio

Tres piezas que van juntas, todas en api-vendedores:

1. **`semanasHechas` se deriva de las resoluciones, no de los ciclos.** Una semana está hecha cuando sus
   filas de `pl_rotacion_cliente` están resueltas. El dato ya existe, sin columnas nuevas.
   `semanasPendientes` y `proponerSemana` no se tocan: solo consumen `semanasHechas`.
2. **`DROP INDEX uq_rotacion_semana` en `pl_ciclo_semana`.** Una línea de DDL, sin tablas ni columnas
   nuevas y sin migración de datos. Dos filas para la semana 2 dejan de ser una anomalía y pasan a ser
   el dato correcto: la recorrió dos veces, cada una con su `fecha_lunes` real.
3. **Registrar un hecho deja de cerrar nada.** `asegurar` abre un ciclo si no hay ninguno, pero un
   cliente de otra semana no fuerza el cierre del abierto. El criterio de "rotación completa" en
   `cerrarCiclo` también pasa a contarse sobre resoluciones.

`uq_un_ciclo_abierto` **no se toca**: sigue habiendo un solo ciclo abierto por vendedor.

### Qué se gana

Cerrar deja de ser destructivo y significa lo único que honestamente significa ("dejó de recorrer esta
zona por ahora"). Volver a una zona queda definido y gratis. Visitar a un cliente de otra semana se
registra hoy, sobre ese cliente, sin tocar el plan y sin cerrar nada.

**Y no cambia ningún número:** la cobertura ya se mide sobre la rotación y ya ignora los ciclos. Esto
solo alinea la navegación con la medición.

### Qué se borra en el front

La parte contraintuitiva: el arreglo **quita** código.

- `CambioDeSemanaDialog.tsx` y su test.
- El estado `cambioDeSemana`, `reintentando` y `manejarCambioDeSemana` en `AgendaSemanaPage`.
- `confirmarCambioDeSemana` de `IIniciarVisitaDTO` / `INoVisitaDTO` y su plumbing en `VisitaFlow`.

El aviso de "te quedan N sin visitar" no se pierde: ya lo da `sincronizar` con `res.sinVisitar`.

## Arreglo de front independiente

**Preview de solo lectura.** `ClienteCard` recibe la prop `modo: 'operable' | 'preview'` y **nunca la
usa** — solo aparece en la declaración de la interfaz. "Reagendar" y "No visité" siguen apareciendo
sobre semanas ya cerradas, donde el vendedor está mirando y no operando. Se deshabilitan con
`modo === 'preview'`. No depende del cambio de backend.

## Testing

**Backend** — casos que este cambio introduce y hoy no cubre nada:

- `semanasHechas` con un ciclo abierto y cero resoluciones **no** cuenta esa semana como hecha (es la
  inversión de la regla actual: hoy sí la cuenta).
- Una semana con todas sus filas resueltas cuenta como hecha aunque nunca se haya abierto un ciclo para
  ella (posible si se resolvió desde el preview).
- `proponerSemana` vuelve a proponer una semana que ya tuvo un ciclo cerrado con pendientes.
- `asegurar` sobre un cliente de otra semana **no** cierra el ciclo abierto y **no** tira 409.
- Dos ciclos para la misma `(rotacion_id, semana)` con `fecha_lunes` distintos conviven.
- `cerrarCiclo` cierra la rotación cuando las resoluciones cubren todo el plan, no cuando los ciclos
  cubren todas las semanas.
- `uq_un_ciclo_abierto` sigue valiendo: sacar `uq_rotacion_semana` no habilita dos ciclos abiertos.
- Un cliente quincenal (dos filas en la rotación) cuenta 2 en el denominador, y resolver una de sus
  celdas no marca la otra.

**Front:**

- `ClienteCard` en `modo="preview"` no ofrece Reagendar ni No visité; en `"operable"` sí.
- `AgendaSemanaPage` ya no maneja `CAMBIO_DE_SEMANA`.

## Descartado

Las cuatro ideas que se evaluaron y no van —auto-resolver pendientes, justificación obligatoria,
semanas secuenciales, UI de rescate masivo— quedaron documentadas con su razón en
`docs/dominio/modelo.md`, sección "Lo que NO hay que hacer", porque son guías durables y no una
decisión de este spec.
