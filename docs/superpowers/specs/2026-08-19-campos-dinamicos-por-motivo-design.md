# Campos dinámicos por motivo: el schema es dato, el tipo es código

**Fecha:** 2026-08-19
**Estado:** diseño aprobado, pendiente de plan de implementación
**Alcance:** api-vendedores + app-planificacion (dos planes, un solo contrato)

Continúa a [`2026-08-19-resolucion-bloques-objecion-cierre-pendientes-design.md`](2026-08-19-resolucion-bloques-objecion-cierre-pendientes-design.md),
que dejó el formulario de resolución agrupado en Objeción / Cierre / Pendientes y anotó que el panel
de detalle por motivo iba a necesitar campos nuevos ("Plazo va a pedir días").

---

## El problema

`pl_motivo.requiere_detalle` es un **booleano**, y lo que dispara es un formulario **fijo de tres
campos** cableado en `ResolucionOfrecimiento.tsx`: marca (de catálogo), competidor (texto libre) y
% de diferencia. Esos tres viven como columnas propias en `pl_ofrecimiento_motivo`.

Eso alcanzaba mientras el único motivo con detalle era "Precio". Ya no:

- **"Plazo" necesita días**, y no hay dónde ponerlo sin agregar una columna y tocar el componente.
- El sistema es nuevo y **se va a iterar mucho** sobre qué campos pedir, cómo mostrarlos y qué
  guardar. Cada iteración hoy es un deploy en dos repos.
- Los tres campos actuales son **obligatorios a la fuerza** (`detalleCompleto` exige los tres). No
  hay forma de pedir un campo opcional.

**El objetivo es que agregar, quitar o renombrar un campo sea un `UPDATE`, no un deploy** — sin
perder la capacidad de analizar esos campos después.

## La decisión: flexibilizar el schema, nunca el tipo del valor

Las dos cosas tienen costos asimétricos, y esa asimetría es la que define el diseño:

| | si te equivocás | reversible |
|---|---|---|
| **schema** (qué campos, label, orden, obligatoriedad) | campo que sobra, label confuso | sí, con un `UPDATE` |
| **tipo del valor** | conviven `"30"`, `"30 dias"`, `"30d"`, `"treinta"` | **no** — no se limpia retroactivamente |

Si el valor se guarda sin tipo, el día que quieras responder "cuántos días de plazo piden en
promedio" el dato ya está sucio y la respuesta se perdió. Es el mismo error que este dominio ya
cometió una vez: por eso existe `pl_motivo` en lugar de mandar texto libre a Cromo, y por eso la
marca se elige de un catálogo en vez de tipearse (ver el comentario en `ResolucionOfrecimiento.tsx`:
con texto libre conviven "Fric Rot", "fricrot" y "FRIC-ROT").

**La sintaxis de la query no es el problema** — MySQL sabe hacer `->>'$.dias'`. El problema es la
higiene del dato.

### Enfoques evaluados

- **A. Schema en JSON + valores en JSON.** Máxima flexibilidad, cero deploy. Descartado: rompe
  exactamente lo que las columnas actuales vinieron a proteger. El DDL de `pl_ofrecimiento_motivo`
  lo dice literal — *"Columnas nullables y NO texto libre: el objetivo es responder 'contra quién
  perdemos y por cuánto' con un GROUP BY"*. Se pierde el índice, y nada impide que entre basura.
- **B. Schema en JSON + valores en tabla de campos, sin tipos declarados.** Agrupable, pero sin
  disciplina de tipo en la escritura vuelve el problema de A por otra puerta.
- **C. Schema en JSON que elige de un menú de tipos conocidos + valores en columnas por tipo.**
  **Elegido.** Un **campo** nuevo de un tipo existente es un `UPDATE`; un **tipo** nuevo es un
  módulo chico con deploy, y eso pasa rarísimo (casi todo campo es un número, un texto corto o algo
  de un catálogo). Es además el patrón que el proyecto **ya eligió** para el detalle de acciones
  comerciales (`registroDetalleAccion`, spec del 2026-08-13), y que ya funciona para Cupo y Descuento.

Vale aclarar por qué esto no contradice ese spec anterior, que **descartó** los formularios
dinámicos: lo que ahí se rechazó fue una **librería de JSON Schema** (react-jsonschema-form y
similares), por el costo de theming para reproducir el diseño mobile. Acá no hay librería ni esquemas
anidados arbitrarios: hay un menú cerrado de tres tipos con editores propios, ya escritos.

## Forma de datos

### El schema: `pl_motivo.campos JSON NULL`

```json
[
  { "campo": "marca",      "tipo": "catalogo", "catalogo": "marca", "label": "Marca",            "requerido": true },
  { "campo": "competidor", "tipo": "texto",    "label": "Competidor", "placeholder": "Ej. Corven", "requerido": true },
  { "campo": "pct",        "tipo": "numero",   "label": "% de diferencia", "min": 0, "max": 999.99, "sufijo": "%", "requerido": true }
]
```

- **`campos` vacío o `NULL` = el motivo no pide nada.** Reemplaza a `requiere_detalle`, que se
  elimina: era exactamente esta pregunta con menos información.
- **El orden del array es el orden en pantalla.** Reordenar es un `UPDATE`.
- **`requerido` es por campo.** Capacidad nueva: hoy los tres son obligatorios sin alternativa.
- `campo` es el identificador estable que se guarda y por el que se agrupa. **No se renombra**
  una vez que hay datos cargados (renombrarlo parte la serie histórica en dos). Cambiar el `label`
  sí es libre — es solo presentación.

### Los tipos: registro en código

| `tipo` | editor | columna donde aterriza |
|---|---|---|
| `texto` | input de texto | `valor_texto` |
| `numero` | input numérico, con `min` / `max` / `sufijo` | `valor_num` |
| `catalogo` | `CatalogoPicker` sobre el catálogo que nombre la clave `catalogo` | `valor_texto` |

El único valor válido de `catalogo` en la v1 es `"marca"` (el que devuelve `getBrandCatalog`). Es una
clave y no un booleano porque el día que haya un campo sobre otro catálogo —línea, rubro— no cambia
el tipo, solo el dato. Un `catalogo` desconocido es un error de validación, no un campo sin editor:
fallar fuerte es mejor que dibujar un select vacío que el vendedor no puede completar.

Los tres cubren todo lo conocido: Precio = `catalogo` + `texto` + `numero`; Plazo = `numero`. El
registro vive espejado —un módulo por tipo en el front (editor) y un validador por tipo en el back—
igual que `registroDetalleAccion` / `accionDetalleValidators`.

**`opciones` (lista fija) y `fecha` quedan fuera de la v1**, no por dificultad sino porque no hay
todavía un caso real que las pida. Mismo criterio que usó el spec del detalle de acciones para
diferir Descuento/Promo/Cobranza: diseñar a ciegas tiene alta chance de rehacerse.

### Los valores: `pl_ofrecimiento_motivo_campo`

```sql
CREATE TABLE IF NOT EXISTS pl_ofrecimiento_motivo_campo (
  ofrecimiento_id INT          NOT NULL,
  motivo_id       INT          NOT NULL,
  campo           VARCHAR(50)  NOT NULL,

  -- Una sola de las dos se llena, según el `tipo` del campo en el schema. Lo garantiza el
  -- registro de tipos al escribir: un campo `numero` nunca toca valor_texto. Es lo que
  -- mantiene el dato agrupable, que es todo el punto de este diseño.
  valor_texto     VARCHAR(200)  NULL,
  valor_num       DECIMAL(12,2) NULL,

  PRIMARY KEY (ofrecimiento_id, motivo_id, campo),
  INDEX idx_campo_texto (campo, valor_texto),
  INDEX idx_campo_num   (campo, valor_num),
  FOREIGN KEY (ofrecimiento_id, motivo_id)
    REFERENCES pl_ofrecimiento_motivo (ofrecimiento_id, motivo_id)
);
```

Con eso, `SELECT AVG(valor_num) FROM pl_ofrecimiento_motivo_campo WHERE campo = 'dias'` funciona el
día que se quiera, indexado. **Ese es el requisito que este diseño protege**: el análisis no es
urgente, pero tiene que seguir siendo posible.

**Costo asumido:** un reporte que cruce varios campos a la vez necesita pivotear. Es un costo
conocido, acotado, y se paga cuando se escriba ese reporte — no ahora.

### El tipo en el front

`IOfrecimientoMotivo` deja de tener tres campos fijos:

```ts
// antes
interface IOfrecimientoMotivo {
    motivoId: number
    marca: string | null
    competidor: string | null
    pctDiferencia: number | null
}

// después
interface IOfrecimientoMotivo {
    motivoId: number
    /** Por `campo` del schema del motivo. Sin entrada = sin cargar. */
    valores: Record<string, string | number | null>
}
```

Esta es **la parte más cara del cambio**, y no por dificultad: son 14 archivos no-test (6 en el
front, 8 en el back) y ~12 de tests los que mencionan los tres campos.

## Migración

**No hay resoluciones cargadas en producción**, así que las tres columnas se van en el mismo paso:
un solo mecanismo, sin híbrido.

Reduce el riesgo un hallazgo de la investigación: **la analítica no agrupa por ninguno de los tres
todavía.** `AnaliticaService.ts:389` solo los pasa a `IVisitaOfrecimientoDetalle`, que alimenta un
panel de detalle de visita. El `INDEX idx_competidor` de la tabla estaba puesto para un futuro que
no llegó. Así que el ripple en analítica es **mapeo de display, no reescritura de queries**.

Pasos:

1. `ALTER TABLE pl_motivo ADD campos JSON NULL` y `DROP requiere_detalle`.
2. `CREATE TABLE pl_ofrecimiento_motivo_campo`.
3. Sembrar `campos` del motivo "Precio" —`motivo_id = 30` con el catálogo nuevo de Objeción /
   Cierre / Pendientes— con los tres campos de arriba. Es el único motivo que hoy pide detalle, así
   que es el único seed necesario; "Plazo → días" se carga por `UPDATE` cuando se quiera, que es
   justamente lo que este cambio habilita.
4. `ALTER TABLE pl_ofrecimiento_motivo DROP marca, DROP competidor, DROP pct_diferencia`
   (con su `INDEX idx_competidor`).

**Los borradores en localStorage** llevan la forma vieja en el teléfono del vendedor. Un borrador con
`{marca, competidor, pctDiferencia}` tiene que descartarse o migrarse al leerlo — si no, revienta al
primer render. `leerBorrador` ya devuelve `null` ante JSON inválido, pero esto es JSON válido con la
forma vieja, así que necesita un chequeo de forma explícito. **Es el detalle que muerde si no se
anticipa**, y hay precedente en la misma sesión: dar de baja un motivo dejaba borradores apuntando a
un `motivoId` inexistente y el cierre moría con 400.

## Validación

Una función genérica, espejada en los dos repos:

- **Backend** (`motivoValidation.ts`): reemplaza el bloque `if (definicion.requiereDetalle)` que hoy
  exige los tres campos a mano. Recorre el schema del motivo, y por cada campo `requerido` verifica
  que haya valor; por cada valor verifica que el tipo y el rango cierren. Sigue tirando
  `MOTIVO_DETALLE_REQUERIDO` para no cambiar el contrato de errores.
- **Frontend** (`lib/resolucionOfrecimiento.ts`): la misma lógica alimenta `motivoIncompleto`, que es
  lo que bloquea Atrás/Siguiente en el wizard. Se previene acá para no gastar un viaje, igual que hoy.

`detalleCompleto` deja de preguntar por los tres campos y pasa a preguntarle al schema.

## Fuera de alcance

- **UI de gerencia para editar el schema.** Se edita por SQL, igual que el resto del catálogo de
  motivos. Si más adelante molesta, es una feature aparte.
- **Tipos compuestos** (arrays, tramos umbral→descuento). Para eso ya existe
  `registroDetalleAccion` en el detalle de la acción comercial, que es donde vive ese caso.
- **Campos condicionales** ("mostrá % solo si el competidor es X").
- **`opciones` y `fecha`** como tipos, hasta que aparezca el caso real.
- **Reportes nuevos** sobre los campos. La tabla los hace posibles; escribirlos es otro trabajo, y el
  spec no lo promete.
