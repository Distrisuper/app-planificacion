---
name: ui-planificacion
description: Usala al crear o cambiar cualquier pantalla, dashboard, tabla, KPI, filtro, segmentado, pestaña, panel o reporte de app-planificacion (vendedor o gerencia /analitica), y al revisar una tarea de front antes de entregarla. También cuando una tabla tiene números a la izquierda o repetidos en cada fila, los filtros no están a la misma altura, aparece un hex o una clase slate/emerald/amber nueva, o una pantalla se ve distinta de Métricas › Productividad.
---

# UI de Planificación

## Principio
Las pantallas **se arman con las piezas**, no se diseñan de cero. Si falta una pieza, se suma a
`src/components/ui/` (con su test) y se usa desde ahí; no se resuelve con clases sueltas en la pantalla.

**Referencia:** Métricas › Productividad (`/analitica/metricas`):
`src/pages/AnaliticaMetricasPage.tsx` (encabezado y fila de filtros) y
`src/components/analitica/metricas/ProductividadEquipo.tsx` (KPIs, panel y tabla con tipos de columna).
Abrila antes de escribir la pantalla.

## Base común
<!-- Esta sección es igual en los tres repos. Si cambia, se copia a ui-versus (app-vendedores) y a
     ui-televentas (app-televentas). -->

- **Composición de un tablero**, siempre en este orden: encabezado (frescura del dato y filtros) →
  protagonista (la pregunta principal, con un solo gráfico grande, si la hay) → franja de KPIs →
  tabla de detalle. El clic en una fila abre el detalle.
- **Un solo nivel de navegación de borde a borde** (el de arriba). Las subsecciones van como pestañas
  en la fila de filtros, a la izquierda; los filtros, a la derecha.
- **Controles a 32 px (`h-8`) y en una fila**, agrupados con divisores (quién · cuándo · cómo se lee).
  Ningún `<select>` ni `<input type="date">` nativo.
- **Mismo borde izquierdo** para encabezado, filtros y contenido: nada centrado a otro ancho.
- **Semáforo único con texto** (ok · atención · mal · neutro): nunca solo color.
- **Una sola métrica coloreada por fila**, la que mide contra el objetivo. El resto en tinta normal o gris.
- **Números a la derecha con `tabular-nums`**, sin cortar. % sin decimales.
- **Nada de valores repetidos en cada fila**: la unidad va en el encabezado ("Visitas válidas") y lo
  que vale igual para todas las filas, en el subtítulo ("Objetivo: 160 por persona").
- **Estados con `EstadoVista`**: la carga mantiene la forma (skeleton), el vacío dice qué hacer, el
  error dice qué pasó y ofrece "Reintentar".
- **Legible a 390 px**: los KPIs bajan de renglón y la tabla scrollea dentro de su panel; la página
  nunca scrollea en horizontal.
- **Sin hex ni paleta cruda**: solo tokens semánticos.
- **Cada número tiene su ayuda** (qué mide y contra qué). Sin números sueltos en el texto.

**Anti-patrones:** kit de tarjetas iguales con borde de color; donuts que no miden nada (o un anillo
lleno para decorar una cifra); KPIs estirados a media pantalla; etiquetas en MAYÚSCULAS; la cifra
teñida además del pill; un estilo de botón distinto por filtro.

## Tokens
Variables en `src/index.css`, nombres en `tailwind.config.cjs`. Lo nuevo usa solo estos:

| Token | Clase | Para |
|---|---|---|
| `superficie` | `bg-superficie` | fondo de la app, segmentado, hover, fila de total |
| `tarjeta` | `bg-tarjeta` | paneles, KPIs, controles |
| `tinta` / `tinta-2` | `text-tinta` / `text-tinta-2` | texto principal / secundario y etiquetas |
| `linea` | `border-linea` | bordes y divisores |
| `primario` | `border-primario`, `ring-primario` | pestaña activa, foco |
| `estado-{ok,atencion,mal,neutro}-{fondo,texto}` | vía `Pill` | semáforo |

Los `ds*` y la paleta de Tailwind (slate, emerald, amber, red) quedan para lo que todavía no migró.

## Piezas: necesitás → usá → nunca

| Necesitás | Usá | Nunca |
|---|---|---|
| Subsecciones de una pantalla | `Pestanas` (`ui/Pestanas.tsx`) en la fila de filtros | Botonera con fondo, una segunda barra de borde a borde |
| Opciones excluyentes (tipo, Día/Semana/Mes, vista) | `Segmentado` (`ui/Segmentado.tsx`) | Relleno navy, `bg-slate-900`, el `Segmentado` viejo de `metricas/ui.tsx` |
| Período | `FiltroPeriodo` (`analitica/FiltroPeriodo.tsx`) = `Segmentado` + `PasoPeriodo` (`ui/PasoPeriodo.tsx`) | Flechas sueltas con el mes flotando, `SelectorPeriodo` en pantallas nuevas |
| Estado (semáforo) | `Pill` con `tono`; cumplimiento: `TONO_PILL[tonoCumplimiento(pct)]` | `CLASE_CUMPLIMIENTO`, `bg-emerald-100`… sueltos |
| Indicadores | `FilaKpi` + `Kpi` (etiqueta en sentence case, cifra, pie gris con `Pill`, `ayuda`) | `Kpi` de `metricas/ui.tsx`, `grid-cols-2` que los estira |
| Sección con título | `Panel` (`titulo`, `subtitulo`, `ayuda`, `acciones`) | `Tarjeta` de `metricas/ui.tsx`, `rounded-2xl shadow-sm` a mano |
| Tabla | `TablaDatos` + `definirColumnas` (`ui/tabla/`) | `<table>` a mano, `Encabezado`/`useOrden`/`comparar` de `metricas/ui.tsx` |
| Cargando / vacío / error | `EstadoVista` | `Cargando`, `ErrorBloque`, un `<p>` con "Cargando…" |
| Ayuda de un número | `ayuda` de `Kpi`/`Panel` (usa `HelpPopover`) | `title` nativo |
| Nombres de personas o clientes | `titleCaseNombre` (`lib/textFormat.ts`) | Mostrar las MAYÚSCULAS del backend |

## Tablas

Cada pantalla declara columnas con tipos y no escribe celdas:

```tsx
const columnas = useMemo(() => definirColumnas<Fila>(c => [
    c.texto('nombre', 'Persona', f => f.nombre, { secundaria: f => f.codigo }),
    c.cantidad('visitas', 'Visitas válidas', f => f.visitas, { total: 'suma' }),
    c.porcentaje('cumplimiento', 'Cumplimiento', f => f.pct, { tono: v => TONO_PILL[tonoCumplimiento(v)] }),
]), [])

<TablaDatos datos={filas} columnas={columnas} getRowId={f => f.id} etiqueta="Productividad"
    numerar ordenInicial={{ id: 'cumplimiento', desc: true }} onClickFila={abrir} />
```

| Tipo | Alinea | Formato | Ancho | Orden | Total |
|---|---|---|---|---|---|
| `texto` | izq. | nombre y, abajo, código chico (`secundaria`). La única elástica | resto | alfabético `Intl.Collator('es')` | — |
| `monto` | der. | $ 850 k · $ 1,2 M | 112 | numérico, mayor primero | `'suma'` o función |
| `cantidad` | der. | 12.480 | 96 | numérico, mayor primero | `'suma'` o función |
| `porcentaje` | der. | 31% (con `tono`, en `Pill`) | 80 | numérico | función (lo define la pantalla) |
| `variacion` | der. | pill ▲ ▼ con la escala del histórico (1,3 / 0,9 / 0,7) | 112 | numérico | función |
| `estado` | izq. | `Pill` con texto | 120 | por severidad (`orden`) | — |
| `fecha` | der. | 16/10/26 (TZ del negocio) | 112 | cronológico | — |
| `accion` | centro | ícono que abre el detalle | 40 | — | — |

- Orden en todas las columnas (asc → desc → sin orden); vacío se ve "—" y queda siempre al final.
- `buscar` agrega la búsqueda sin acentos; `unidad`, el contador "N de M". El total se calcula sobre
  lo filtrado. Encabezado y total fijos; `table-layout: fixed` con los anchos del tipo.
- Columnas memorizadas y `getRowId` estable. Formateadores `Intl` a nivel de módulo, celdas puras.

**Volumen:**

| Filas | Dónde se ordena y filtra | Cómo se dibuja |
|---|---|---|
| hasta 200 | en el navegador (TanStack) | todas |
| 200 a 5.000 | en el navegador (TanStack) | virtualizado (`TablaDatos` lo hace solo arriba de 200; `virtualizar` lo fuerza) |
| más de 5.000 o que crece | en api-vendedores (`?orden=&q=&pagina=`, `manualSorting`) | virtualizado con carga por páginas (`useInfiniteQuery`) |

## Cierre: checklist visual (obligatorio antes de entregar)
La verificación de la tarea es `npm run check`: no levantes la app para mirarla (ver `AGENTS.md`).
Lo visual se cubre revisando el código de la pantalla contra esta lista, ítem por ítem, con
Métricas › Productividad al lado:

- [ ] Composición en orden: encabezado y filtros → (protagonista) → KPIs → tabla.
- [ ] Subsecciones con `Pestanas` en la fila de filtros; un solo nivel de borde a borde.
- [ ] Filtros en una fila, todos a 32 px, con el mismo borde izquierdo que el contenido.
- [ ] KPIs con `FilaKpi`/`Kpi`, a su ancho, etiquetas sin mayúsculas, cada uno con ayuda.
- [ ] Tabla con `TablaDatos` y tipos de columna: números a la derecha, unidad en el encabezado, nada
      repetido en cada fila, una sola métrica con color, total sobre lo filtrado.
- [ ] Estados con `EstadoVista` (cargando, vacío con qué hacer, error con "Reintentar").
- [ ] Ningún hex, `slate-*`, `emerald-*`, `amber-*`, `red-*` ni `ds*` nuevo en lo que tocaste.
- [ ] A 390 px nada se corta ni genera scroll horizontal de página (la tabla scrollea en su panel).

En el PR, en "No cubren": "verificación visual", con la ruta, los filtros que muestran datos (o
`VITE_ANALITICA_MOCK=1`) y el rol que la ve. Quien revisa la mira a 1440 px y a 390 px, con datos,
vacía y con error.
