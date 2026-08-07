# Tabs entre apps externas dentro del sheet embebido

**Fecha:** 2026-08-07
**Estado:** aprobado

## Problema

[[2026-08-06-apps-externas-contexto-cliente-design]] resolvió abrir Pagos/Versus/CRM embebidos con
el contexto de un cliente. Pero una vez adentro (por ejemplo, viendo Versus del cliente "Repuestos
Sanqui"), no hay forma de pasar a Pagos del mismo cliente sin cerrar el sheet y volver a tocar el
botón desde la card. `useAppExterna` solo sostiene una `montada` (una app + un cliente) a la vez:
abrir una segunda app descarta la primera.

## Alcance

**Entra:**

- Tabs en el header del sheet embebido (`AppExternaSheet`) para las apps del registro
  (`APPS_EXTERNAS`), visibles mientras el sheet está abierto para un cliente.
- Mantener las tres apps vivas simultáneamente para el cliente activo: cambiar de tab es
  instantáneo (no recarga el iframe) y conserva el estado de la app que no se ve.
- Descartar todas las instancias vivas al cambiar de cliente (no tiene sentido sostener Pagos del
  cliente anterior) o al cambiar de día/semana (ya lo hace `desmontar`).

**No entra:**

- Persistir apps de más de un cliente a la vez. El alcance sigue siendo "las apps del cliente que
  el vendedor tiene abierto ahora", igual que el spec anterior.
- Cambios en el registro (`appsExternas.ts`) ni en el contrato de handoff. Se reusa tal cual.

## Diseño

### 1. `useAppExterna` — de una `montada` a un set por cliente

Estado nuevo:

```ts
clienteActivo: IVisitClientCard | null
montadas: Record<string, AppExternaMontada>   // key = app.id
appActivaId: string | null
visible: boolean
```

`abrir(app, cliente)`:

1. Si `cliente.codigoParticularCliente !== clienteActivo?.codigoParticularCliente`: se reemplaza
   todo el record por `{ [app.id]: nuevaMontada }` y `clienteActivo` pasa a ser `cliente`. Cambiar
   de cliente es el único evento que descarta instancias vivas fuera de `desmontar`.
2. Si es el mismo cliente y `montadas[app.id]` ya existe: no se vuelve a resolver el handoff (evita
   recrear el iframe); solo cambia `appActivaId`.
3. Si es el mismo cliente y `montadas[app.id]` no existe: se agrega al record con
   `resolverHandoff(app, cliente)`.
4. En los tres casos: `appActivaId = app.id`, `visible = true`.

`ocultar()`: solo `visible = false`. Ningún cambio de comportamiento respecto de hoy — no
desmonta.

`desmontar()`: limpia `montadas`, `clienteActivo`, `appActivaId`, `visible`.

Esto es aditivo sobre la API actual del hook: `abrir`/`ocultar`/`desmontar` mantienen la misma
firma; lo que cambia es qué exponen (`montadas`+`appActivaId` en vez de `montada`).

### 2. `AppExternaSheet` — tabs + un frame por app montada

El header reemplaza el label fijo de una sola app por una fila de tabs, una por cada app en
`APPS_EXTERNAS` (mismo filtro de configuración que ya aplica ese registro), resaltando
`appActivaId`. Tocar una tab llama a la misma función `abrir` con `(app, clienteActivo)` — no hace
falta una función nueva, el caso 2/3 de arriba ya cubre "cambiar a una app ya montada" y "montar
una nueva para el mismo cliente".

El ciclo de carga (`cargando`/`error`/`intento`/timeout de 15s/listener nativo de `error`) se
extrae del sheet a un subcomponente `AppExternaFrame`, uno por entrada de `montadas`, para que cada
app tenga su propio estado de carga independiente. `AppExternaFrame` recibe `montada` y
`activa: boolean`; cuando no es la activa se oculta con el mismo patrón `invisible
pointer-events-none` que ya usa el sheet completo, sin desmontarse.

El botón "Recargar" del header actúa sobre el frame de `appActivaId`. El botón "Cerrar" (X) sigue
llamando a `onClose` (→ `ocultar`, no desmonta).

### 3. Wiring en `AgendaSemanaPage`

- La condición de render pasa de `appExterna.montada` a
  `Object.keys(appExterna.montadas).length > 0`.
- La `key` del `<AppExternaSheet>` pasa de `` `${app.id}:${cliente.codigo}` `` a solo
  `clienteActivo.codigoParticularCliente`: el cambio de app ahora ocurre *dentro* del sheet
  (cambia `appActivaId`, no remonta nada), así que ya no hace falta remontar el sheet entero al
  cambiar de tab. El motivo original de la key (evitar que un `src=` nuevo en el mismo nodo sume
  una entrada de historial) sigue vigente, pero ahora vive un nivel más abajo: cada
  `AppExternaFrame` lleva su propio `key={app.id}` dentro del record, así que cambiar de cliente
  (que sí reemplaza el record entero) sigue remontando los iframes correspondientes.
- El resto del wiring (`onAbrirAppExterna={appExterna.abrir}` en `ClienteCard`/`VisitaSheet`,
  `desmontarAppExterna()` en el efecto de cambio de día/semana) no cambia.

## Casos borde

- Tocar "Pagos" desde la card de un cliente B mientras el sheet está abierto con el cliente A:
  regla 1 de `abrir` — se descartan las montadas de A, arranca de cero con B.
- Cerrar el sheet (X) y volver a abrir la misma app del mismo cliente: sigue instantáneo, igual que
  hoy — `ocultar` no toca el record.

## Testing

- `useAppExterna.test.tsx`: abrir dos apps distintas para el mismo cliente conserva ambas
  instancias en `montadas` (con handoffs resueltos una sola vez cada una); abrir una app para un
  cliente distinto descarta las montadas anteriores; reabrir la misma app+cliente no vuelve a
  llamar `resolverHandoff`.
- `AppExternaSheet.test.tsx`: tocar una tab no montada dispara su propio overlay de carga; tocar
  una tab ya montada no reordena/recrea el iframe activo anterior (se verifica que el nodo del
  iframe de la app previa sigue presente en el DOM, solo oculto).
- `AgendaSemanaPage.test.tsx`: ajusta el mock de `useAppExterna` a la forma nueva
  (`montadas`/`appActivaId` en vez de `montada`).
