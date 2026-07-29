# Rediseño de la card de cliente en la agenda + sheet unificado de reagendar/no-visité

## Contexto

El usuario compartió un mockup visual (screenshots) con un rediseño de la card de
cliente en `AgendaBoard`/`ClienteCard`: chip de código de cliente, pill de estado,
fila de dirección tinteada con chevron, y una fila de 3 acciones (Propuesta,
teléfono, calendario) en vez de los botones de texto actuales ("Reagendar" /
"No visité"). También compartió el mockup del sheet que dispara el ícono de
calendario: "ESTADO DE LA VISITA", con lista de días de la semana y una opción
"No visité" debajo de un separador "O REGISTRAR".

Hoy `ClienteCard` tiene botones de texto separados para Reagendar y No visité,
cada uno abriendo su propio sheet (`ReagendarSheet` y `ResolucionSheet`,
gestionados independientemente en `AgendaSemanaPage`). El teléfono se muestra
como link de texto en una fila propia. La dirección no tiene acción ni chevron.

## Decisiones

1. **Chip de código de cliente**: se agrega antes del pill de estado, mostrando
   `codigoParticularCliente` (campo ya existente en `IAgendaClient`). No es un
   dato nuevo a pedir al backend.
2. **Nombre tachado cuando `resuelto`**: se agrega `line-through` además del
   cambio de color que ya existe.
3. **Dirección como fila tinteada con chevron**, clickeable, abre Google Maps:
   si hay `latitud`/`longitud` usa esas coordenadas
   (`https://www.google.com/maps/search/?api=1&query=lat,lng`); si no, cae al
   texto de `direccion` como query. Se elimina la fila de teléfono como link de
   texto (el teléfono pasa a ser solo el botón ícono de la fila de acciones).
4. **Fila de acciones única, visible para todo cliente `operable`** (resuelto o
   no) — hoy solo se muestra si `!resuelto`:
   - `⚡ Propuesta`: `flex-1`, sólido navy cuando `!resuelto`, outline cuando
     `resuelto` (se puede seguir consultando la propuesta ya resuelta).
   - Ícono teléfono: botón outline cuadrado, dispara `tel:` (misma lógica de
     `telefonoLimpio` que ya existe; si no hay teléfono limpio, el botón no se
     renderiza).
   - Ícono calendario: botón outline cuadrado, abre el nuevo `EstadoVisitaSheet`.
   - El aviso de "rubros sin cargar" se mantiene arriba de esta fila, sin
     cambios.
5. **`EstadoVisitaSheet` nuevo**, reemplaza a `ReagendarSheet` y al botón de
   texto "No visité" como puntos de entrada (el multi-select de motivos de
   `ResolucionSheet` se sigue usando, sin cambios, como segundo paso):
   - Construido sobre `BottomSheet` (mismo primitivo).
   - Eyebrow "ESTADO DE LA VISITA", título = nombre del cliente.
   - Lista los 5 días (`DIAS`, mismo mapeo `DIA_NOMBRE` + fechas de
     `getWeekDates()`/`formatDayDate` que usa `ReagendarSheet` hoy), marcando
     el día actual con "(actual)".
   - Separador "O REGISTRAR" + una fila "✕ No visité", que se muestra
     "(ya registrado)" con estilo distinto/deshabilitado cuando
     `estado === 'no_visita'`.
   - Selección por radio (un solo pick a la vez) + botón "Elegí una opción",
     deshabilitado hasta elegir algo.
   - Al confirmar: si se eligió un día, dispara `reagendar.mutateAsync`
     directo (igual que hoy). Si se eligió "No visité", cierra este sheet y
     abre `ResolucionSheet` para elegir motivo (mismo flujo que hoy tiene
     `onConfirmNoVisita`).
6. **`AgendaSemanaPage`**: se reemplazan los dos estados
   `reagendarCliente`/`noVisitaCliente` + sus dos handlers separados por un
   único estado `estadoVisitaCliente` que abre `EstadoVisitaSheet`; al elegir
   "No visité" dentro de ese sheet, se abre `ResolucionSheet` como hoy (se
   reutiliza tal cual, solo cambia qué la dispara).
7. **`ReagendarSheet.tsx` se borra** una vez migrada su lógica de día/fecha al
   nuevo sheet.

## Alcance de la implementación

- `src/components/ClienteCard.tsx` — chip de código, tachado de nombre, fila
  de dirección con chevron + link a maps, fila de acciones única (Propuesta +
  ícono teléfono + ícono calendario) visible siempre que `operable`.
- `src/components/EstadoVisitaSheet.tsx` (nuevo) — sheet combinado descrito en
  la decisión 5, reemplaza a `ReagendarSheet.tsx` (que se borra).
- `src/pages/AgendaSemanaPage.tsx` — colapsar `reagendarCliente` +
  `noVisitaCliente` en un único estado/handler; conectar `EstadoVisitaSheet` y
  mantener `ResolucionSheet` como segundo paso para "No visité".
- `src/components/ClienteCard.test.tsx`, `src/components/EstadoVisitaSheet.test.tsx`
  (nuevo, adaptado del test de `ReagendarSheet` si existe) — cubrir chip de
  código, tachado, link a maps, y los dos caminos de confirmación del sheet
  (día vs. no visité).

## Fuera de alcance

- No se toca `ResolucionSheet.tsx` (motivo picker) ni la mutación
  `useNoVisita`/`useReagendar` — se reusan tal cual.
- No se agrega ninguna acción nueva de backend/API.
- No se cambia `VersusComparativo`, `RubroCard`, `PropuestaSheet`, ni el resto
  del flujo de visita.
- No se define qué pasa si se reagenda un cliente que ya está `no_visita`
  (el sheet lo permite tal como está mockeado — "ya registrado" es solo un
  indicador visual, no bloquea elegir otro día); si el negocio quiere
  bloquear esa corrección, es una decisión aparte.
