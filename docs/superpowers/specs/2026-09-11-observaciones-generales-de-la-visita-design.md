# Observaciones generales de la visita

**Fecha:** 2026-09-11
**Estado:** diseñado, sin implementar
**Alcance:** dos repos — `api-vendedores` (columna + endpoint + Cromo) y `app-planificacion` (el campo)

## Qué se agrega

Un campo de **texto libre, uno por visita**, que el vendedor puede llenar al cerrar. Aparece
**solo cuando ya cumplió el mínimo de rubros** (`min(2, total ofrecidos)`), es **opcional**, y
viaja a Cromo dentro del seguimiento que ya se genera automáticamente al cerrar.

## Dónde vive el dato: `pl_resolucion`, no `pl_ofrecimiento`

Es una observación **de la visita**, no de un rubro. En este dominio hay un choque de
vocabulario que conviene tener presente:

- En la **UI**, "Resolución" es lo de cada rubro (el wizard de motivos) → `pl_ofrecimiento_motivo`.
- En el **esquema**, `pl_resolucion` es el **hecho a nivel visita**: una fila por fila del plan,
  con `tipo = visita | no_visita`.

Así que `pl_resolucion` ya es exactamente el nivel que se necesita.

```sql
ALTER TABLE pl_resolucion ADD COLUMN observaciones VARCHAR(500) NULL;
```

`VARCHAR(500)` y no `TEXT`: es una nota tipeada parado en un mostrador, no un documento, y el
tope protege el payload de Cromo. El DDL consolidado vive en api-vendedores,
`docs/db-notes/planificacion-ciclo-tables.sql`; el `ALTER` se anota ahí aparte porque **en
producción es una intervención manual de ops** (ese archivo ya lo advierte).

### Lo que NO es

No reemplaza ni compite con el motivo estructurado. `pl_resolucion_motivo` y
`pl_ofrecimiento_motivo` existen justamente porque sobre texto libre no se puede hacer
`GROUP BY` (ver CLAUDE.md y `docs/dominio/modelo.md`). Este campo es **narrativa
complementaria**: sirve para que un humano lea el contexto, no para agrupar. Si alguna vez
aparece la tentación de resolver un rubro escribiendo acá, es la señal de que falta un motivo
en el catálogo `pl_motivo`.

## `api-vendedores`

| capa | cambio |
|---|---|
| `models/planificacion/Resolucion.ts` | campo `observaciones`, `field: 'observaciones'` |
| `ICerrarVisitaDTO` | `observaciones?: string` |
| `planificacionController.cerrarVisita` | validación (abajo) |
| `ResolucionRepository.cerrarVisita` | pasa de `(id, coordFinal)` a `(id, coordFinal, observaciones)` |
| `services/crm/seguimientoTexto.ts` | la observación se suma como párrafo final de la narrativa |

### Validación

- `trim()` antes de todo.
- Vacío o solo espacios → se guarda `null`, **nunca** `' '`. Un string vacío en la columna
  haría que "no dejó observación" y "dejó una observación vacía" se vean distinto en una
  query, sin que signifiquen nada distinto.
- Más de 500 caracteres → `400` con code `OBSERVACIONES_MUY_LARGA`. El front pone
  `maxLength={500}`, así que este 400 es inalcanzable desde la UI actual — existe para el
  cliente que no la respete.

### La trampa del orden

`VisitasService.cerrar` lee `resolucion` **antes** de llamar a `ResolucionRepository.cerrarVisita`,
y después le pasa esa misma instancia a `CrmEventoVisitaService.notificar({ resolucion })`.
Esa instancia es de **antes** del update, así que `resolucion.observaciones` llegaría
`undefined` y la observación nunca saldría a Cromo — con todo lo demás funcionando y sin
ningún error visible.

**La observación se le pasa a `notificar` de forma explícita**, no leyéndola de la instancia.
Es más difícil de romper que refrescar el modelo y depender de que nadie reordene las líneas.

El orden general no cambia y es el que ya fija CLAUDE.md: **primero se persiste el hecho,
después se notifica a Cromo.** Un Cromo caído sigue siendo un mensaje demorado, no pérdida de
datos.

### El guard `SIN_CONTENIDO` no se toca

`CrmEventoVisitaService` no manda una visita sin narrativa. Ese guard sigue mirando **solo la
narrativa de rubros**: una visita con cero rubros resueltos pero con observación escrita
**no** notifica a Cromo — la observación se persiste igual.

Es una decisión tomada, no un olvido. Solo puede pasar con un bundle viejo cacheado, porque
el gate de los 2 rubros vive únicamente en el front (`PUT /visitas/:id/cerrar` acepta cerrar
con cero resoluciones).

## `app-planificacion`

La cadena: `ICerrarVisitaDTO` → `cerrarVisita()` → `useCerrarVisita` → `VisitaFlow.onCerrarVisita`,
con el texto que junta `VisitaSheet`.

### El campo va en el PIE FIJO

Dos renglones (`rows={2}`), con su rótulo `OBSERVACIONES (OPCIONAL)` en la misma banda de
9.5px uppercase que usan los otros bloques del sheet, y un contador `0/500`. Queda arriba de
la fila PAGOS/VERSUS/CRM, dentro del pie que no scrollea.

**Esto es una decisión del usuario, tomada sobre una alternativa propuesta.** Se evaluó
ponerlo al pie del cuerpo scrolleable (sin riesgo de teclado, pero nace fuera de pantalla
debajo de un catálogo de docenas de filas) y una fila fija colapsada que abre un sheet chico
para escribir. Se eligió el textarea real en el pie porque la presencia permanente —el
vendedor ve siempre si dejó observación o no, sin scrollear— vale su costo.

**Costos asumidos, explícitos:**

1. **~56px del pie fijo**, que es el recurso más escaso del sheet.
2. **El riesgo del teclado.** El sheet es `position: fixed` con `h-[96dvh]`, y un input dentro
   de un contenedor fijo al abrirse el teclado virtual es el caso que se rompe: el pie puede
   quedar tapado o saltar.

### Mitigación del teclado, y su límite

Se agrega a `index.html`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, interactive-widget=resizes-content" />
```

`interactive-widget=resizes-content` hace que el teclado **encoja el layout viewport**, así
que `dvh` y `position: fixed` vuelven a comportarse: el pie sube con el teclado en vez de
quedar debajo.

**Anda en Chrome/Android. iOS Safari no lo soporta** — ahí el teclado no redimensiona el
layout viewport y los elementos fijos se quedan en su lugar mientras la página scrollea.

Por eso:

- `rows={2}` **fijo, sin auto-grow**. Un textarea que crece dentro de un pie fijo mueve el
  botón de cerrar mientras el vendedor tipea.
- **Hay que probarlo en un iPhone real antes de mergear.** Es la única parte de este diseño
  que no se puede verificar con tests: jsdom no tiene teclado virtual ni visual viewport.
  Si en iOS resulta inusable, el camino de vuelta ya está identificado y no requiere rediseñar
  el backend — es la fila fija colapsada que abre un sheet chico, la alternativa que ya se
  evaluó.

### Cuándo aparece

Solo con las tres condiciones juntas:

```
faltanParaMinimo === 0  &&  ofrecimientosCargados  &&  !visitaCerrada
```

`ofrecimientosCargados` no es opcional acá, por la misma razón por la que ya gobierna el botón
de cerrar: con el GET en vuelo o fallado, `ofrecimientos` es `[]`, `min(2, 0)` es 0 y
`faltanParaMinimo` se auto-satisface. Sin esa condición el campo aparecería sobre una visita
cuyos rubros ni cargaron.

### Borrador local, en su propia clave

`visita-observaciones-<visitaId>` en localStorage, junto a `visita-borrador-<id>` y
`visita-detalles-<id>`.

Clave propia y no un campo dentro del borrador de motivos, por la razón que ya está
documentada en `resolucionDraft.ts` para `detalles`: cambiar la forma del borrador de motivos
obliga a tocar `VisitaSheet`, el wizard y su pie a la vez, y **dejaría ilegibles los borradores
ya guardados de las visitas en curso** (`leerBorrador` descarta lo que no matchea la forma
esperada).

Se escribe en cada cambio, sobrevive a minimizar / cerrar / reabrir el sheet, y se limpia en
`cerrarConBorrador` junto con los otros dos, solo después de que el guardado salió bien.

### Visita cerrada

Si la visita ya está cerrada y tiene observación, se muestra **en modo lectura** en el sheet
de consulta. Sin esto, el vendedor no tiene ningún lugar donde releer lo que escribió: el
sheet cerrado es su única vista de la visita, y `/analitica` es de gerencia.

**De dónde sale el dato, y por qué no hace falta endpoint nuevo:** se agrega
`observaciones: string | null` a `IAgendaClient`, que ya carga metadata a nivel visita
(`visitaId`, `ofrecimientosPendientes`, `seguimiento`) desde el **mismo `LEFT JOIN` con la
resolución** que ya produce `estado`. O sea que el campo viaja con la agenda que el front ya
pide, sin request extra — mismo criterio que ya está documentado en CLAUDE.md para el estado
de cada cliente en la vista semanal ("es gratis: sale del LEFT JOIN que ya se lee").

`VisitaSheet` lo recibe por el prop `cliente` que ya tiene.

## Tests

**api-vendedores**
- `trim` + vacío → `null` (no `''`).
- 501 caracteres → 400 `OBSERVACIONES_MUY_LARGA`.
- **La observación llega a Cromo.** Es el test que protege la trampa del orden: sin él, pasar
  la instancia vieja rompe la feature en silencio.
- Una visita sin rubros resueltos y con observación **no** notifica (el guard sigue en pie).

**app-planificacion**
- El campo **no** aparece con rubros faltantes, ni con `ofrecimientos` sin cargar, ni con la
  visita cerrada en modo edición.
- Aparece al llegar al mínimo.
- Sobrevive a cerrar y reabrir el sheet (borrador).
- Se limpia al cerrar con éxito, y **no** se limpia si el guardado falló.
- `observaciones` viaja en el DTO de cierre; vacío no manda el campo.
- Visita cerrada con observación → se ve, y no es editable.

## Fuera de alcance

Mostrar la observación en `/analitica` (detalle de visita de gerencia). Va a Cromo, que es el
canal narrativo de la organización, así que el dato no queda ciego. Queda anotado como
continuación.
