# "No visité" con la visita ya abierta

Fecha: 2026-09-15
Estado: diseño aprobado, pendiente de implementación
Repos afectados: `app-planificacion` (front) y `api-vendedores` (dominio `planificacion`)

## 1. El problema

El vendedor toca **Iniciar visita** en la vereda —el gate de los 100 m lo empuja a hacerlo
ahí, antes de entrar— y recién adentro se entera de que el encargado se fue de vacaciones,
que está cerrado, o que no lo pueden atender. A partir de ese momento no tiene salida:

- `VisitasService.registrarNoVisita` arranca con `assertSinResolver(fila)`, y la fila **ya
  tiene** resolución: iniciar la visita creó una con `tipo='visita'` y `fecha_fin NULL`. El
  backend devuelve 409 `VISITA_ACTIVA_EXISTENTE`.
- La única puerta que queda abierta es **Cerrar visita**, que exige `min(2, ofrecidos)`
  rubros cargados y —lo importante— graba un `tipo='visita'` **cerrado**, que la cobertura
  cuenta como cliente visitado. Es un dato falso: no entró al local.

Y hay un agravante de UX que explica por qué se vive como "bloqueante" y no como "falta una
opción": el botón **Reagendar** de `ClienteCard` se renderiza con `!resuelto`, o sea que
**también se ve con la visita en curso**. El vendedor entra por ahí a "No visité", elige el
motivo, y `onConfirmNoVisita` (`AgendaSemanaPage`) sólo contempla `CICLO_CLIENTE_YA_RESUELTO`
en su `catch`: el 409 cae en la rama genérica y le muestra *"No se pudo registrar. Volvé a
intentar."* — un mensaje que se lee como falla de red, así que reintenta, y falla de nuevo.

> Pendiente de confirmar contra la app antes de implementar: que el error que ve el vendedor
> sea efectivamente ese. Está deducido de `assertSinResolver` + el `catch` de
> `onConfirmNoVisita`, no observado en vivo. No cambia el diseño, sí el texto del PR.

## 2. La decisión de fondo: convertir, no borrar ni cerrar

La resolución abierta **se convierte** en `no_visita` (`tipo`, `fecha_fin`, más sus motivos).
No se borra la fila ni se crea una nueva.

- **Por qué no cerrarla como visita:** inflaría la cobertura con un cliente que nadie visitó.
  Es exactamente el tipo de dato que el proyecto existe para no producir.
- **Por qué no borrarla:** se perdería el `coord_inicio` —evidencia de que estuvo parado en
  la puerta— y el rastro de que arrancó y abortó. Borrar deja la fila como si nunca hubiera
  pasado nada.
- **Por qué no rompe la inmutabilidad de `pl_resolucion`:** la regla es que una resolución
  **cerrada** no se edita ni se reabre. Una visita con `fecha_fin NULL` todavía no resolvió
  nada; esto es la primera y única declaración del hecho, no una corrección de una anterior.
  La operación se rechaza explícitamente si la fila ya tiene `fecha_fin`.

**Efecto lateral gratis en la analítica:** `AnaliticaRepository.findCobertura` bucketiza por
`tipo` (`SUM(r.tipo = 'visita' AND r.fecha_fin IS NOT NULL) AS visitados`, etc.), así que la
fila sale sola de `en_curso` y entra en `no_visita` sin tocar una línea de SQL.
`AnaliticaService` sólo pide ofrecimientos de las filas con `tipo === 'visita'`, así que los
`pl_visita_rubro` que hayan quedado colgando no contaminan ningún indicador.

**Por qué el `UPDATE` es la operación correcta, no sólo la más práctica:** la fila ya es
mutable por diseño — `ResolucionRepository.cerrarVisita` hace exactamente esto, un `UPDATE`
sobre la misma fila abierta, para escribirle `fecha_fin`/`coord_final`/`observaciones`.
`pl_resolucion` nace abierta y se termina de escribir después; la inmutabilidad empieza
recién cuando `fecha_fin` deja de ser `NULL`. Convertir a `no_visita` es esa misma escritura
de cierre, hacia el otro estado terminal — no una excepción al modelo. Las alternativas
pierden en la comparación: borrar+recrear es igual de mutación (un `DELETE`, peor) y pierde
`coord_inicio`; una columna nueva de "anulada" en vez de tocar `tipo` obliga a que
`findCobertura`, `AgendaService`, `estadoCicloCliente` y la vista de actividad —los cuatro
bucketizan por `tipo`— aprendan a filtrarla, y el que se olvide cuenta una visita que no
existió.

**Costo a tener presente, no a resolver ahora:** en un `no_visita` convertido,
`fecha_inicio` y `fecha_fin` ya no son el mismo instante (a diferencia del que nace de
cero, donde si acaso son ambos "ahora"). Hoy nada mide duración sobre filas `no_visita`
—`AnaliticaService` sólo lee ofrecimientos de `tipo === 'visita'`—, así que no rompe nada
existente. Pero el dato queda ahí: si el día de mañana se quiere medir "cuánto tardó en
darse cuenta de que estaba cerrado", hay que saber que sólo tiene sentido para los
convertidos, no para los `no_visita` que nacieron sin haber iniciado.

## 3. Backend (`api-vendedores`)

### 3.1 Endpoint

```
POST /planificacion/visitas/:id/no-visita
body: { motivoIds: number[] }
```

Ruta con `authMiddleware` + `authorize('vendedor')`, al lado de `/visitas/:id/cerrar`.
Controller `PlanificacionController.noVisitaDeVisitaAbierta`: valida que `motivoIds` sea array (mismo
400 que `noVisita`) y delega.

### 3.2 `VisitasService.registrarNoVisitaSobreVisitaAbierta(user, visitaId, motivoIds)`

1. `resolveVisitaPropia(user, visitaId)` — misma pertenencia que `cerrar`: la visita es del
   vendedor y cuelga de su rotación abierta (no del ciclo abierto en este instante).
2. Si `resolucion.tipo !== 'visita'` → 409 `CICLO_CLIENTE_YA_RESUELTO`.
3. Si `resolucion.fechaFin != null` → 409 `VISITA_YA_CERRADA`. **Acá vive la inmutabilidad.**
4. `validarMotivosDeVisita(motivoIds, await MotivosService.mapById())` — el mismo catálogo a
   nivel visita que usa `registrarNoVisita`, sin ninguna variante propia.
5. Transacción sobre `sequelizeWritePlanificacion`:
   - `ResolucionRepository.marcarNoVisita(visitaId, transaction)` → `UPDATE pl_resolucion SET
     tipo='no_visita', fecha_fin=NOW() WHERE id=? AND tipo='visita' AND fecha_fin IS NULL`.
     El `WHERE` completo (no sólo el id) es la protección contra la carrera con un `cerrar`
     concurrente: si afectó 0 filas, se lanza `VISITA_YA_CERRADA`.
   - `ResolucionRepository.guardarMotivos(visitaId, motivoIds, transaction)` — reusado tal
     cual.
6. **Después** de la transacción, `CrmEventoVisitaService.notificar(...)` con
   `tipo: 'no_visita'`, best-effort y con el mismo `.catch(log.error)` que
   `registrarNoVisita`. El orden importa y es el del dominio: primero se persiste el hecho,
   después se notifica.
7. Devuelve `{ rotacionClienteId }`, igual que `registrarNoVisita`.

**Los `pl_visita_rubro` NO se borran.** Son rastro de lo que el vendedor alcanzó a cargar, no
molestan a ningún indicador (§2) y borrarlos sería destruir información para ganar prolijidad.

**Sin captura de ubicación.** Este es el camino de emergencia: `capturarUbicacion()` puede
tardar ~23 s y puede fallar, y condicionar el desbloqueo a un fix de GPS reintroduce el
problema que la feature viene a resolver. Además `no_visita` hoy nunca captura ubicación
—está anotado como pendiente en `docs/dominio/modelo.md`— así que esto no abre un caso nuevo.

## 4. Front (`app-planificacion`)

### 4.1 Los dos caminos, un solo endpoint

`AgendaSemanaPage.onConfirmNoVisita` elige según el estado del cliente:

```ts
cliente.estado === 'en_curso'  →  noVisitaSobreVisitaAbierta(visitaId, motivoIds)
otro                            →  noVisita({ rotacionClienteId, motivoIds })
```

La fuente del `visitaId` no puede ser sólo el snapshot de la agenda: si la visita se inició
en esta sesión y la agenda todavía no refetcheó, la card sigue diciendo `pendiente`. La
decisión se toma contra `visitaEnCurso` cuando su `rotacionClienteId` coincide con el cliente
—que es la fuente de verdad para ese caso, igual que en `VisitaFlow`— y contra
`cliente.estado`/`cliente.visitaId` en cualquier otro.

Con eso el **"Reagendar → No visité"** que el vendedor ya conoce deja de fallar, sin agregar
pantalla ninguna. Es la mitad indispensable de esta feature: si hubiera que cortar el alcance,
es lo que queda.

Nuevo hook `useNoVisitaSobreVisitaAbierta` en `useVisitas.ts`, construido con `useMutacionDeVisita` para
heredar las invalidaciones de agenda + ciclo.

Después de un registro exitoso hay que soltar la visita en curso, igual que un cierre: limpiar
las dos anclas locales (`limpiarInicioVisita`, `limpiarVisitaEnCurso`), llamar a
`onVisitaCerrada()` para que el `rotacionClienteId` entre en `rotacionesClienteSueltas` y no
lo readopte un refetch viejo, y hacer desaparecer `VisitaEnCursoBar`. Toast `'Registrado'`,
el mismo del camino existente.

### 4.2 La salida desde adentro del sheet

- **`BottomSheet`**: prop opcional `acciones?: ReactNode`. Si viene, aparece un botón `⋯`
  (`MoreVertical`) en el header, a la izquierda de minimizar/X, con el mismo tamaño y estilo
  que esos dos. Abre un popover anclado abajo a la derecha del botón. El popover tiene su
  propio catcher a pantalla completa con `stopPropagation` —el overlay del sheet cierra el
  sheet al click, y no queremos que abrir el menú y tocar afuera cierre la visita entera—.
  Sin `acciones`, el header queda byte por byte como está hoy.
- **`VisitaSheet`**: con `!visitaCerrada`, pasa una acción **"No visité · registrar motivo"**
  e informa al padre cuántos rubros ya tiene completos: `onNoVisita(completos)`.
  **Va en el menú del header y no en el pie** por dos razones: el pie es el recurso más
  escaso del sheet (entran 5 filas de rubros), y una segunda salida del tamaño de un CTA al
  lado de "Cerrar visita" se lee como el atajo fácil para no cargar rubros.
- **`VisitaFlow`**: dueño del flujo. Monta un `ResolucionSheet` (`eyebrow="No visité"`,
  `confirmLabel="Registrar"`, motivos de `useMotivos('visita')`) después de `VisitaSheet` en
  el árbol, para que pinte encima. Al confirmar llama a la mutación y aplica el soltado de
  §4.1.
- **`ResolucionSheet`**: prop opcional `aviso?: ReactNode`, renderizada arriba de la lista de
  motivos. Cuando el vendedor ya cargó rubros, `VisitaFlow` pasa: *"Cargaste N rubros. Al
  registrar «No visité» esta visita no cuenta como hecha."* Se permite igual —la prioridad es
  no dejarlo trabado nunca— pero sabiendo lo que hace.

### 4.3 Errores

| código | tratamiento |
|---|---|
| `VISITA_YA_CERRADA`, `CICLO_CLIENTE_YA_RESUELTO` | toast `info` *"Este cliente ya estaba resuelto. Actualizamos tu agenda."* + cerrar el flujo. La invalidación ya disparó el refetch. |
| cualquier otro | toast `error` *"No se pudo registrar. Volvé a intentar."*, el sheet queda abierto con la selección puesta. |

## 5. Vocabulario

El ítem dice **"No visité"**, exactamente igual que en `EstadoVisitaSheet`: es el mismo hecho
y tiene que llamarse igual en los dos lados. Nada de "anular", "cancelar" ni "abortar" en
pantalla — son palabras del esquema, no del vendedor, y además sugieren que la visita se
deshace, cuando lo que pasa es que se declara un hecho distinto.

## 6. Fuera de alcance

- No se toca el gate de los 100 m (`RADIO_INICIO_METROS`) ni el mínimo de `min(2, ofrecidos)`
  rubros. Son los dos candidatos obvios a "aflojar" y ninguno es la causa del bloqueo.
- No se agrega "No visité" a `PropuestaSheet` ni a `MapaVisita`: antes de iniciar ya existe,
  por la card.
- No hay reapertura ni edición: registrado el `no_visita`, la fila queda resuelta e
  inmutable, y por lo tanto tampoco reacomodable (`FILA_RESUELTA`).
- No se captura ubicación en este camino (§3.2). Si algún día se decide capturarla para
  `no_visita`, es la decisión pendiente que ya está anotada en `docs/dominio/modelo.md` y
  aplica a los dos caminos, no sólo a éste.

## 7. Tests

**Backend** (`VisitasService.spec.ts`): convierte y guarda motivos; rechaza con `fecha_fin`
seteada (`VISITA_YA_CERRADA`); rechaza una fila `no_visita`; rechaza visita ajena; motivo
inválido; el `UPDATE` que afecta 0 filas se traduce a 409; Cromo se llama después de
persistir y un Cromo caído no rompe la operación.

**Front**: `AgendaSemanaPage` elige endpoint según `estado` (los dos casos); `VisitaSheet`
ofrece el ítem sólo con la visita abierta y no en una cerrada; `VisitaFlow` abre el
`ResolucionSheet`, muestra el aviso sólo con rubros cargados, y al confirmar limpia las
anclas y suelta la visita en curso; `BottomSheet` no dibuja el `⋯` sin `acciones`, y el click
fuera del popover lo cierra sin cerrar el sheet.
