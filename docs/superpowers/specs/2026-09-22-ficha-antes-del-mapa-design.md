# La ficha se pide al tocar "Iniciar visita", no después del mapa

Fecha: 2026-09-22
Estado: diseñado.
Reemplaza la sección 7 ("El gate: dónde corta, y por qué ahí") de
[`2026-09-22-relevamiento-datos-del-comercio-design.md`](2026-09-22-relevamiento-datos-del-comercio-design.md).
El resto de ese spec —tablas, PUT, catálogo, formulario, edición posterior— sigue vigente tal cual.

## 1. El problema

El gate de "Datos del comercio" vive hoy dentro de `VisitaFlow.onIniciar`, que es el **último**
paso del camino: propuesta → mapa → "Iniciar visita" → *formulario*. Se eligió ese punto porque
los tres caminos de inicio (con mapa, sin coordenadas, alta) convergen ahí, y un solo corte los
cubría a los tres.

El costo es de lectura, y es grande: **el botón no hace lo que dice**. El vendedor tocó "Iniciar
visita" —el CTA final, el que ya pasó el gate de los 100 m— y en vez de arrancar la visita
aparece un formulario de cuatro pasos. El gesto de iniciar queda partido en dos.

## 2. La decisión

**El corte se mueve adelante del mapa: al momento en que el vendedor declara que va a visitar.**

Son los dos botones "Iniciar visita" que abren el camino:

- el verde de la card, en la agenda (camino directo al mapa);
- el del pie de `PropuestaSheet`.

Los dos terminan en el mismo estado interno —`propuestaPendiente !== null`, que es lo que abre
`MapaVisita`— así que sigue siendo **un solo corte**, sólo que un paso antes.

```
tocar "Iniciar visita"  (card o propuesta)
        │
        ▼
 ¿ficha.pendientes vacío?  ──sí──►  mapa  →  "Iniciar visita"  →  POST visita
        │ no
        ▼
 PerfilComercioSheet  (bloqueante, sólo los campos pendientes)
        │                    └── cerrar ──►  vuelve a la AGENDA. La visita no arranca.
        │ confirmar
        ▼
 PUT ficha  ──falla──►  error en el sheet, no avanza
        │ ok
        ▼
      mapa  →  "Iniciar visita"  →  POST visita  →  arranca el cronómetro
```

Lo que se gana: **"Iniciar visita" del mapa vuelve a significar iniciar.** La ficha pasa a ser un
paso del camino de entrada, antes del GPS, con la propuesta ya confirmada atrás.

## 3. Lo que se conserva

Las dos garantías por las que el corte estaba antes del POST siguen intactas —de hecho se
refuerzan, porque el corte se aleja todavía más del POST:

1. **El cronómetro no corre mientras se carga.** Los minutos del formulario no se le suman a la
   duración que mide `estadoDuracion.ts`.
2. **Abandonar no deja basura.** La visita nunca existió: no hay fila abierta en `pl_resolucion`
   esperando un cierre que no llega.

También sigue igual: el **`PUT` va antes** y condiciona (si la ficha no se guardó, no se avanza;
el sheet muestra el error con "Volver a intentar"), la ficha se pide **hasta que esté completa y
después nunca más**, el chip "Datos del comercio" de `VisitaSheet` para corregir después, y el
modo `edicion` del sheet.

## 4. Cerrar el formulario cierra la card

En modo `gate`, cerrar `PerfilComercioSheet` **vuelve a la agenda** (`cerrarFlujo()`), no a la
pantalla de atrás. Cambia respecto del spec anterior, y a propósito: no hay medio estado. O carga
la ficha y entra, o se va. La única puerta para iniciar esa visita pasa por el formulario.

Dos razones, además de la de arriba:

- **Simetría entre los dos caminos.** Desde la card no hay pantalla de atrás (la propuesta se
  saltea), así que "volver atrás" ya significaba "volver a la agenda" en ese camino. Que el otro
  volviera a la propuesta era la excepción, no la regla.
- **Sin ese cierre, el camino directo se rompe.** Limpiar sólo el estado del sheet deja
  `cargandoDirecto` habilitado, y el efecto que lee la propuesta cacheada reabre el sheet al
  instante: imposible de cerrar. Es exactamente el bug que ya documenta el `onCancel` de
  `MapaVisita` para el mapa.

No visitar sigue siendo una opción declarable ("No visité", "Reagendar"), así que nadie queda
trabado.

## 5. La reversión: se puede completar sin estar en el local

El spec anterior evaluó esto mismo y lo descartó, con esta razón textual: *"Moverlo antes del mapa
perdería la garantía de que se completa estando en el local, que es todo el valor del dato"*.
**Se revierte a propósito**, y las dos caras quedan acá para no rediscutirlo:

- **Se pierde:** el gate de los 100 m ya no es un prerrequisito del formulario. El vendedor puede
  completarlo desde el auto, o desde su casa la noche anterior. Mitigación real pero parcial: el
  formulario sale recién cuando decidió visitar a **ese** cliente, y el dato sigue siendo mucho
  más fácil de contestar mirando el local que de memoria.
- **Se gana:** el costo que el spec anterior anotaba como aceptado —*"con el GPS roto, ese día no
  se releva"*, porque el formulario nunca aparecía si "Iniciar visita" quedaba deshabilitado en
  el mapa— desaparece. Un vendedor sin fix ahora sí completa la ficha.
- **Se gana:** el CTA deja de mentir, que es el motivo del cambio.

Si algún día se quiere volver a atar el relevamiento a la presencia física, el camino no es
mover el gate de nuevo (el CTA volvería a partirse): es que el backend compare `coord_inicio`
contra `coord_cliente` y marque la ficha como relevada a distancia. Hoy no se hace.

## 6. La forma del cambio

Todo en `src/components/VisitaFlow.tsx`. No se toca `PerfilComercioSheet`, ni el hook, ni la API.

| qué | cómo queda |
|---|---|
| `fichaLista` (nuevo estado, reset por cliente) | "la ficha ya no bloquea a este cliente en este flujo". No se depende de que la caché de la agenda haya refrescado dentro del mismo tick. |
| `perfilPendiente` | mismo estado que hoy (la propuesta guardada mientras carga), pero se setea **antes** del mapa. |
| `onConfirmarPropuesta(propuesta, opts)` | gana el corte: si falta ficha y no viene `fichaConfirmada`, guarda en `perfilPendiente` y no avanza. Si no, sigue como hoy (mapa con coords, `onIniciar` sin ellas). |
| efecto de `cargandoDirecto` | cuando llega `propuestaDirecta`, entra por `onConfirmarPropuesta` en vez de setear `propuestaPendiente` directo. Un solo lugar decide. |
| `onConfirmar` del sheet (modo `gate`) | PUT OK → `setFichaLista(true)`, limpia `perfilPendiente`, y llama `onConfirmarPropuesta(propuesta, { fichaConfirmada: true })`. Ya no llama a `onIniciar`. |
| `onClose` del sheet (modo `gate`) | `cerrarFlujo()`. En modo `edicion` sigue cerrando sólo el sheet. |
| `onIniciar` | **conserva** el chequeo, ahora contra `fichaLista`, como red de seguridad: cubre la visita de **alta** (que no pasa por la propuesta y tiene su propio mapa en modo `ubicar`) y cualquier camino que se agregue mañana. |
| `MapaVisita` | sin cambios: sigue abriendo con `propuestaPendiente !== null`. |

**El camino directo mantiene el loader.** Al tocar el botón verde de la card se sigue viendo
"Buscando la propuesta…" y recién después el formulario. Se evaluó abrir el formulario al toque y
cargar la propuesta por detrás: se descartó por no sumar un estado más para tapar una espera que
casi siempre es de menos de un segundo.

**La visita de alta no cambia de momento**: su formulario sigue apareciendo después del mapa de
ubicación, porque ahí el mapa no es un gate de cercanía sino el único modo de plantar la
coordenada del comercio — y no hay propuesta previa donde cortar.

## 7. Tests

En `src/components/VisitaFlow.test.tsx`, sobre los que ya existen:

- Con ficha pendiente, confirmar la propuesta abre el sheet y **no** abre el mapa.
- Con ficha pendiente, "Iniciar visita" directo desde la card abre el sheet y **no** abre el mapa.
- Confirmar el sheet (PUT OK) abre el mapa, y **no** dispara el POST de la visita.
- Cerrar el sheet en modo gate llama a `onClose` del flujo (vuelve a la agenda).
- Con la ficha completa, los dos caminos van derecho al mapa (sin sheet).
- La red de seguridad: la visita de alta con ficha pendiente sigue mostrando el sheet en
  `onIniciar`.
