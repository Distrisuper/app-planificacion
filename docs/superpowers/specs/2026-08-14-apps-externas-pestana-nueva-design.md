# Apps externas: pestaña/ventana nueva por defecto (reversión de la decisión de iframe)

**Fecha:** 2026-08-14
**Estado:** aprobado

## Problema

[[2026-08-06-apps-externas-contexto-cliente-design]] decidió embeber Pagos/Versus/CRM en un iframe
de pantalla completa (`AppExternaSheet`) y descartó explícitamente `window.open(_blank)` como
default, por la fricción del selector de pestañas en navegador móvil sin instalar.

Se pide ahora invertir esa decisión: al tocar una app externa (desde `AccionesExternas`, en la card
o en el sheet del cliente), abrir en una ventana/pestaña nueva en vez de montar el sheet embebido.

## Decisión

**El tap por defecto pasa a `window.open(url, '_blank', 'noopener,noreferrer')`**, usando la misma
URL de handoff que ya resuelve `resolverHandoff` (`appsExternas.ts`) — sin cambios en el registro ni
en el contrato de handoff de cada app.

Esto reemplaza, para el camino principal, tanto al sheet embebido como al comportamiento que hoy
tiene el botón ↗ dentro de `AppExternaSheet` (que existía como salida de emergencia para el caso de
cookies/storage de terceros bloqueadas — ver spec de tabs). Con el default ya abriendo afuera, ese
caso de falla deja de aplicarle a la ruta principal.

## Alcance

**Entra:**

- Nueva función de apertura (en `AgendaSemanaPage.tsx` o extraída a un helper si se reusa en más de
  un lugar) que calcula la URL con `resolverHandoff` y hace `window.open`.
- Rewiring: la prop `onAbrirAppExterna` que hoy vale `appExterna.abrir` pasa a valer esta función
  nueva, en los mismos puntos donde se pasa hoy (`AgendaBoard`, `VisitaFlow`/`VisitaSheet`,
  `AppHeader` si aplica).

**No entra (deliberadamente, para no perder trabajo hecho):**

- **No se borra** `AppExternaSheet.tsx`, `useAppExterna.ts`, ni sus tests. Quedan en el repo,
  funcionales, sin invocarse desde el camino principal. Es infraestructura preparada por si en el
  futuro hace falta volver a embeber (p. ej. una app que sí resuelva el problema de storage
  particionado, o un caso de uso distinto). `AppExternaSheet` ya es condicional a que
  `useAppExterna().montadas` tenga entradas — con nada que lo dispare, simplemente no renderiza.
- No se cambia el registro de apps (`appsExternas.ts`), ni el contrato `Handoff`, ni
  `resolverToken`/`resolverHandoff`.
- No se toca `AccionesExternas.tsx`: sigue siendo el mismo componente de botones, con la misma
  firma `onAbrir(app, cliente)` — cambia únicamente qué función recibe desde arriba.

## Por qué no se borra el código embebido

Borrar `AppExternaSheet`/`useAppExterna` ahora sería la decisión correcta si esto fuera definitivo,
pero el spec original tenía razones de UX reales (vistazo rápido de pie frente al cliente, sin
selector de pestañas) que motivaron el diseño embebido en primer lugar. Mantener el código
funcional y desconectado cuesta poco y evita rehacer ~4 archivos si la decisión se revisa de nuevo
con datos de uso real.

## Testing

- Tests existentes de `AppExternaSheet.test.tsx` y `useAppExterna.test.tsx` no cambian: siguen
  probando ese código tal cual, aunque nada lo invoque desde `AgendaSemanaPage` en producción.
- `AccionesExternas.test.tsx`: sigue probando que `onAbrir` se llama con `(app, cliente)` al tocar
  cada botón — no le importa qué hace el consumidor con eso.
- Nuevo: test de la función de apertura (`resolverHandoff` + `window.open` con
  `noopener,noreferrer`), y de que `AgendaSemanaPage`/`AgendaBoard` la usan en vez de
  `appExterna.abrir`.
