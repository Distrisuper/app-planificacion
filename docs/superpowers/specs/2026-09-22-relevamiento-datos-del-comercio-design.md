# Relevamiento "Datos del comercio": perfilar al cliente antes de abrir la visita

Fecha: 2026-09-22
Estado: front implementado con persistencia mock (rama `feat/relevamiento-datos-comercio`)
Repos afectados: `app-planificacion` (front). `api-vendedores` todavía **no**: ver §7.

**Alcance de este documento: sólo el front.** Dónde se guarda el perfil y por dónde se edita
después quedaron fuera a pedido explícito, y están anotados como huecos conocidos en §7. Este
spec se va a iterar cuando se cierren.

## 1. El problema

De cada cliente sabemos lo que el warehouse trae de la operación: qué compra, cuánto, con qué
descuentos. No sabemos **qué clase de comercio es**: si es una gomería o un rulemanero, si lo
atiende una persona o quince, si factura 8 millones o 200.

Sin eso, dos cosas quedan cojas:

- **La propuesta comercial** compara al cliente contra el promedio de la zona, pero la zona
  mezcla un lubricentro de dos personas con un concesionario. El promedio contra el que se mide
  no es el de sus pares.
- **La segmentación** no existe. No se puede responder "cómo nos va en los talleres de frenos
  de más de 50M", porque no hay con qué agrupar.

El único que tiene ese dato es el vendedor, y lo tiene **parado adentro del local**.

## 2. La decisión de fondo: un gate genérico, un formulario concreto

Son dos piezas separadas, y se separan desde el día uno porque van a evolucionar distinto.

| | qué es | dónde vive | cuándo cambia |
|---|---|---|---|
| **El gate** | "¿a este cliente le falta algún relevamiento?" | `VisitaFlow` + `relevamientoPendiente` | cuando se suma un relevamiento nuevo |
| **El formulario** | las tres preguntas concretas | `PerfilComercioSheet` | cuando cambian las preguntas |

El gate no sabe qué preguntas hay adentro. Sumar el segundo formulario es agregar una entrada al
registro, no volver a tocar `VisitaFlow`.

**El formulario NO es data-driven.** Las tres preguntas están escritas a mano en TSX. Con un
solo formulario, un motor con schema JSON es especulación cara: son tres tipos de control
distintos (chips multi, stepper numérico, segmented control ordinal) y el TSX es más corto y más
legible que la config que lo generaría. Cuando exista el tercero y se vea el patrón real, ahí se
abstrae con evidencia. Lo genérico desde ahora es el gate, que es lo que hace barato al segundo.

## 3. Dónde corta el gate, y por qué ahí

Los tres caminos de inicio que existen hoy —con mapa, sin coordenadas, y cliente nuevo (alta)—
terminan todos en `VisitaFlow.onIniciar`. **El gate se pone ahí y sólo ahí**: un único punto de
corte cubre los tres sin tocar ninguna de las tres pantallas.

```
tocar "Iniciar visita"  (ya pasó el gate de 100 m)
        │
        ▼
 ¿falta el relevamiento?  ──no──►  onIniciar()  →  POST  →  arranca el cronómetro
        │ sí
        ▼
 PerfilComercioSheet  (bloqueante)
        │ confirmar
        ▼
   onIniciar()  →  POST  →  arranca el cronómetro
```

**Corta ANTES del POST, no después.** Es la decisión no obvia de este spec y tiene dos razones:

1. **El cronómetro no corre mientras se carga.** Si el POST saliera primero, los dos o tres
   minutos del formulario se le suman a la duración de la visita, que es justo lo que el
   semáforo de `estadoDuracion.ts` mide. Una visita de 4 minutos reales se vería como de 7.
2. **Abandonar no deja basura.** Si el vendedor cierra el sheet sin cargar, la visita **nunca
   existió**: no hay fila abierta en `pl_resolucion` esperando un cierre que no va a llegar.
   Con el POST adelante, cerrar la app a mitad del formulario deja una visita abierta sin perfil.

Corolario: al confirmar, `onIniciar` corre **entero y normal** — captura de GPS incluida, y con
ella el re-chequeo de los 100 m contra la coordenada definitiva. O sea que si el vendedor carga
el formulario y se va caminando, el gate de distancia lo agarra igual. No se saltea nada.

## 4. Obligatorio duro

Sin completar el formulario **no se puede iniciar la visita**. No hay "ahora no".

La alternativa evaluada era postergar con reintento en la próxima visita. Se descartó: el dato
sólo se consigue con el vendedor adentro del local, y un botón de escape convierte el
relevamiento en algo que se completa el día que sobra tiempo, o sea nunca.

**La única salida es no iniciar.** Cerrar el sheet vuelve a la pantalla de atrás (el mapa, o la
propuesta) — no a la agenda, y no arranca la visita. Es consistente con el resto del dominio: no
hay forma de saltear el requisito, pero tampoco hay forma de quedar trabado, porque no visitar
siempre es una opción declarable.

Ojo con la asimetría respecto de otros gates de la app: el gate de cierre de visita (mínimo de
`min(2, total)` rubros) es **sólo del front** y un bundle viejo se lo saltea. Este también lo es
por ahora, y cuando exista el endpoint hay que decidir si el backend lo replica.

## 5. Se pide una sola vez por cliente

No vence, no se vuelve a pedir, no hay confirmación periódica. La especialidad no cambia (una
gomería no se vuelve rulemanera), y para lo que sí cambia —personal y facturación— se prefiere
un dato viejo a fricción repetida sobre el mismo cliente: a la tercera vez el vendedor toca
"confirmar" sin leer, y el dato queda igual de viejo pero además parece fresco.

**También se pide en las visitas de alta** (`tipo='alta'`, cliente nuevo). Es donde más falta:
del prospecto no se sabe absolutamente nada, y es el momento exacto en que se lo está conociendo.
La visita de alta no tiene mapa ni gate de distancia, pero sí pasa por `onIniciar`, así que el
gate la cubre sin código extra.

## 6. La pantalla

Un solo `BottomSheet` scrolleable (`altura="hasta-completa"`) con las tres preguntas una debajo
de la otra y el botón fijo al pie. No un wizard de tres pasos: son tres toques y un número, y
partirlo en tres pantallas agrega navegación sin agregar claridad — además de esconder cuánto
falta, que es justo lo que el vendedor quiere saber cuando lo interrumpen.

### 6.1 Los tres controles, y por qué cada uno es distinto

| pregunta | control | cardinalidad |
|---|---|---|
| Especialidad | chips redondeados en `flex-wrap`, navy relleno con ✓ | **varias** |
| Personas que trabajan | stepper `− [n] +`, número tipeable | un entero |
| Facturación mensual | segmented control de 5 segmentos unidos | **una** |

**Las formas distintas no son decoración: dicen la regla.** Chips sueltos = elegí las que
quieras; una pieza segmentada = elegí uno. La primera versión usaba chips para especialidad y
filas con radio para facturación, y los dos grupos se leían como igual de "elegibles".

**Especialidad** — 15 opciones, orden dictado por el negocio (no alfabético: las más frecuentes
arriba). *Monomarca* abre un campo de texto "¿De qué marca?" con `autoFocus`; destildarla borra
el texto, para que volver a tildarla no reaparezca con la marca anterior ya cargada. Es **texto
libre y no el `brandCatalog`** a propósito: el catálogo cubre las marcas que nosotros vendemos, y
acá la pregunta es de qué marca es el taller, que puede ser cualquiera. Se acepta el costo de que
"Bosch" y "bosh" no agrupen.

**Personas** — número exacto, no rangos. El stepper existe porque era el único control del
formulario que abría teclado, y en un bottom sheet el teclado empuja el layout y tapa el botón
del pie. El caso típico (1-10 personas) se resuelve tocando `+`; el que tiene 40 toca el número y
lo tipea. Desde vacío, el primer `+` va a **1**, no a 0: nadie tiene 0 personas trabajando.

**Facturación** — los códigos vienen **invertidos** del negocio (`5` = menor a 10M, `1` = mayor a
100M) y se respetan tal cual para no traducir al analizar. En pantalla van de **menor a mayor**,
al revés que el código: leídos descendentes dejan de parecer una escala. El segmento muestra la
etiqueta corta (`+30M`) y lleva el texto completo como `aria-label` ("Mayor a 30M"), así que el
lector de pantalla no pierde nada.

En filas con radio esta sección costaba ~240px —un tercio del sheet— y la quinta opción quedaba
abajo del scroll, o sea que nadie sabía que existía. En una fila cuesta ~44px. **No volver a
filas**: con los tres controles compactos el formulario entra entero en una pantalla, y ver las
tres preguntas juntas es lo que hace que se entienda cuánto falta sin explorar.

### 6.2 El botón

Gris `#F1F4F9` con texto navy mientras falte algo, verde cuando está completo. Mismo criterio
que el cierre de visita, y por la misma razón: el verde al 40% que da el `disabled:` del variant
se lee como un CTA roto en vez de como "te falta cargar algo". **Necesita `disabled:opacity-100`
explícito**, porque ese 40% también lava el gris y deja ilegible justo el texto que hay que leer.

El label nombra el faltante cuando es uno solo (`Falta la facturación`) y lo cuenta cuando son
varios (`Faltan 3 datos`). Con todo cargado dice `Iniciar visita`: el mismo verbo del botón que
el vendedor tocó para llegar hasta acá, para que quede claro que el formulario es un paso en el
camino y no un desvío.

### 6.3 Vocabulario

En la UI es **"Datos del comercio"**. Nunca "relevamiento", "perfilado", "encuesta" ni
"formulario": el vendedor no ve las estructuras del sistema (ver CLAUDE.md, "El vendedor no ve
ciclos ni rotaciones"). El texto de apoyo es una sola línea —*"Se carga una sola vez, antes de
arrancar"*— y está ahí para justificar la interrupción, que es lo único que el vendedor necesita
saber en ese momento.

## 7. Lo que falta, y por qué no está

Tres huecos conocidos. Ninguno es un olvido.

### 7.1 Persistencia (fuera de alcance por pedido)

Hoy el perfil se pierde: al confirmar sale por `console.info('[mock] Datos del comercio', …)`.
El tipo `IPerfilComercio` ya define la forma del dato, así que lo que falta es la tabla y el
endpoint. Probablemente una tabla propia del dominio (`pl_cliente_perfil` o similar), **nunca un
campo nuevo en el warehouse** — eso está prohibido sin excepciones (ver CLAUDE.md).

Nota para cuando se implemente: el perfil es del **cliente**, no de la visita. No cuelga de
`pl_resolucion` ni de `pl_rotacion_cliente`, porque sobrevive a la rotación y no es un hecho de
un momento. Es una propiedad del comercio, con la fecha en que se relevó.

### 7.2 La edición posterior (sin diseñar)

Se decidió que el perfil **se tiene que poder modificar** después de cargado, y no se diseñó por
dónde. El candidato natural es el menú del header de `VisitaSheet`. No existe todavía.

### 7.3 El gate quedó después del mapa

Consecuencia del corte elegido en §3: el formulario aparece recién cuando el vendedor pasó el
gate de los 100 m. **Un vendedor con el GPS roto nunca lo ve** — el botón "Iniciar visita" queda
deshabilitado y el relevamiento no se pide.

Se detectó probando (el mapa mostraba "Estás a 400712 m del cliente"). No está resuelto. Las dos
salidas son moverlo antes del mapa —y perder la garantía de que se completa estando en el
local— o dejarlo donde está y aceptar que los clientes de vendedores con GPS caído no se relevan.
Se dejó como está porque el caso es raro y la garantía vale, pero la decisión no está tomada.

## 8. Implementación

### 8.1 Archivos

| archivo | qué tiene |
|---|---|
| `src/lib/relevamientos.ts` | catálogos (15 especialidades, 5 tramos), `IPerfilComercio`, validación (`faltantesPerfil`, `aPerfil`) y el seam `relevamientoPendiente` |
| `src/components/relevamiento/PerfilComercioSheet.tsx` | la pantalla |
| `src/components/relevamiento/PerfilComercioSheet.test.tsx` | 7 tests |
| `src/components/VisitaFlow.tsx` | el gate (intercepción en `onIniciar` + render del sheet) |

### 8.2 El seam, y qué se cambia el día del backend

```ts
export function relevamientoPendiente(_rotacionClienteId: number): boolean {
    return true // MOCK
}
```

Ese `return true` es **el único punto** que cambia cuando exista la persistencia: pasa a mirar el
campo que diga si el cliente ya fue relevado (o la lista de relevamientos pendientes, cuando haya
más de uno). Mientras tanto hace que el sheet aparezca en todos los clientes, que es lo que
permite verlo sin backend.

Del lado de `VisitaFlow` lo acompaña un `useRef` (`perfilListo`) que recuerda "ya lo cargó en
esta pasada", para que confirmar no vuelva a disparar el sheet en el mismo intento. Se resetea al
cambiar de cliente.

### 8.3 Nota sobre los tests

El gate se interpone entre "Iniciar visita" y el POST, así que rompió **28 tests** que recorren
ese camino (27 en `VisitaFlow.test.tsx`, 1 en `AgendaSemanaPage.test.tsx`). Se arreglaron
mockeando `relevamientoPendiente: () => false` en esos dos archivos: son tests del flujo de la
visita y de la agenda, no del gate.

Consecuencia a tener presente: **hoy ningún test cubre el gate en sí** — que intercepte antes del
POST, que cubra los tres caminos, que salir sin cargar no deje la visita abierta. No se escribió
porque con el mock siempre-`true` no se puede testear la otra mitad del comportamiento (el
cliente ya relevado, que es el caso normal en producción). Va cuando se cierre §7.1.

Estado de verificación al momento de escribir esto: `tsc --noEmit` limpio, suite completa
**1199/1199 en 110 archivos**.
