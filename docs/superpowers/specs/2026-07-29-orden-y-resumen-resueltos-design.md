# Reordenar resueltos al final + resumen en vez de acciones

## Contexto

Hoy las cards de un día se listan en el orden que devuelve la agenda (orden de ruta), sin
importar el estado. Un cliente ya visitado o no-visitado queda mezclado entre los pendientes,
obligando a scrollear entre resueltos para encontrar el próximo pendiente. Además, la fila de
acciones (Propuesta / llamar / estado de la visita) se muestra igual para resueltos que para
pendientes, aunque llamar a alguien ya visitado o reagendarlo no tiene sentido.

## Diseño

### 1. Orden: resueltos al final

En `AgendaBoard`, antes de renderizar la lista de un día, se particiona con `estaResuelto()`
(la misma función que ya usan los contadores): primero los no resueltos (`pendiente`,
`en_curso`) en su orden original, después los resueltos (`visitada`, `no_visita`,
`reagendada`) en su orden original. Partición estable, sin comparador — no hace falta más que
`[...no resueltos, ...resueltos]`. Sin separador visual entre los dos grupos: las resueltas ya
se distinguen por su propio estilo (tachado, fondo verde, pill de estado).

### 2. Acciones en cards resueltas

- **`visitada` con `visitaId` no nulo** (hubo visita real): la fila de acciones pasa a tener un
  solo botón, **"Ver resumen"** (antes decía "Propuesta"), que abre el mismo `VisitaSheet` de
  siempre en modo lectura (ya existe: `visitaCerrada` oculta el botón de cerrar). Es el mismo
  handler que hoy (`onAbrir`), solo cambia la etiqueta y se sacan los íconos de llamar y de
  estado de la visita.
- **`no_visita` o `reagendada`** (sin `visitaId`, no hay nada que resumir): no se muestra fila
  de acciones — la card queda con su pill de estado, dirección y nada más.
  - Pendiente de backend: el motivo elegido en "No visité" no viaja hoy en la respuesta de la
    agenda (`IAgendaClient` no lo expone), así que no se puede mostrar como texto todavía. Se
    deja para cuando exista ese campo — no se implementa ahora.
- **Pendientes/en curso**: sin cambios, siguen los 3 botones de siempre.

## Fuera de alcance

- Mostrar el motivo de "No visité" en la card (requiere un campo nuevo en la agenda de
  api-vendedores).
- Separador visual entre pendientes y resueltos.
- Cualquier cambio al criterio de `estaResuelto()` en sí.
