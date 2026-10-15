# Decisiones del front que no son obvias

**Documento vivo.** Reglas de la app que un cambio razonable rompería sin darse cuenta, con su
porqué. Salió del viejo `CLAUDE.md` (octubre 2026), verificado contra el código: lo que ya no era
cierto se corrigió o se borró. Si el código y este archivo se contradicen, gana el código y se
corrige acá. El modelo de dominio (plan, hecho, ciclo) está en [`modelo.md`](modelo.md) y el
esquema en [`tablas.md`](tablas.md).

Los specs de `docs/superpowers/` son **históricos**: sirven para el porqué, no para el
estado actual.

## Stack y patrones

- Vite + React 19 + TypeScript. React 19 es una divergencia intencional respecto de app-vendedores
  (React 18), no un descuido. App web/PWA pura (`vite-plugin-pwa`), sin Capacitor.
- Tailwind con tres componentes estilo shadcn hechos a mano (`src/components/ui/button.tsx` con
  `cva`, `badge.tsx`, `avatar.tsx`); de Radix solo `react-dialog` y `react-alert-dialog`.
- Datos del servidor con React Query + axios (`src/api/apiClient.ts`: Bearer desde
  `localStorage.access_token`; en un 401 limpia el storage de sesión y recarga). El único contexto
  de React es `AuthContext`; el estado de negocio vive en los hooks `src/hooks/use*.ts`.
- Mapas con Leaflet (`MapaVisita` del vendedor y el de analítica).
- `zod` está en `package.json` pero hoy no se importa en `src`.

## Tiempo y horas

- **La "semana actual" la resuelve el backend** (`GET /planificacion/ciclo/actual`). Se descartó
  calcularla en el front con un ancla local: se desincroniza al reinstalar o cambiar de equipo.
- **Las horas se formatean en TZ de negocio**, con `horaNegocio` de `src/lib/fechas.ts`
  (`America/Argentina/Buenos_Aires` vía `Intl`). Nunca `slice(11, 16)` sobre el ISO (muestra UTC)
  ni `toLocaleTimeString()` pelado (usa la TZ del equipo). El campo `fecha` no se recalcula: es el
  día de negocio que resolvió el backend y la clave de agrupación de la cobertura.
- **El vendedor no ve ciclos ni rotaciones: ve zonas, días y clientes.** En su UI la "semana" es
  `pl_rotacion_semana.descripcion` (el nombre de la zona), con el número solo como fallback.
  No existe `CerrarSemanaSheet` ni llamada a `ciclo/cerrar` en el front: el cierre es automático,
  dentro de `sincronizar` del backend (se llama al montar la agenda y al volver del background), y
  no crea resoluciones.

## Iniciar la visita: mapa y GPS

- **Geolocalización: se persisten dos puntos** (inicio y fin) con `navigator.geolocation` y la app
  al frente. Mientras el mapa está abierto hay `watchPosition` para la UI, pero no hay tracking en
  segundo plano (no existe en web; si algún día se pide, el camino es Capacitor + plugin nativo).
- **Iniciar exige ≤100 m del cliente; cerrar no tiene gate.** `RADIO_INICIO_METROS` en
  `src/lib/distancia.ts`, regla solo del front. Bloquea por evidencia positiva de lejanía:
  `estaFueraDeRango` = `distancia − precisión > 100`, así un fix grueso no traba al vendedor parado
  en el local. No confundir con `TOLERANCIA_METROS` de `analiticaFormat.ts` (respaldo de pintado
  de analítica mientras carga el criterio).
- En `MapaVisita` el botón de iniciar está deshabilitado mientras el primer fix no llegó
  (`calculando`) o está fuera de rango. `sinUbicacion` deja iniciar a propósito, pero solo después
  de que el GPS falló. Si ya hubo un fix bueno y uno posterior falla, no vuelve `sinUbicacion`:
  muestra "No pudimos actualizar tu posición…" (`errorActualizando`, `marcarFixFallido` /
  `marcarFixExitoso`, con `posicionRef` porque los callbacks del watch no se redefinen).
- **Entre dos fixes gana el mejor, no el último: todo fix pasa por `aceptarFix`.** Uno anterior al
  vigente se descarta; uno más nuevo pero más grueso solo reemplaza si el vigente venció
  (`VIGENCIA_FIX_MS` = 30 s). "Recalcular posición" pasa `explicito` y saltea esa segunda regla. Un
  error del watch con un recálculo en vuelo se ignora (`marcarFixFallido({ deWatch: true })`).
  En `handleRecalcular`, "el arbitraje descartó el fix" y "falló" son ramas distintas: lo primero no
  muestra error.
- **`obtenerFix()` (`src/lib/geolocation.ts`) es la única puerta para pedir posición**: dos
  etapas (alta precisión y, si falla, baja), devuelve `precisionM` y `timestamp`;
  `capturarUbicacion()` es su formateo para el backend. El `maximumAge > 0` no se toca: el
  comentario del archivo explica por qué 0 reintroduce la espera de ~23 s.
- `VisitaFlow.onIniciar` repite el chequeo de distancia con la coordenada definitiva.
- **Con la visita abierta**, el aviso "te alejaste" (`useAlejadoDelCliente`, watch de baja
  precisión) entra con `d − p > radio` y sale con `d + p ≤ radio`; un fix ambiguo no cambia el
  estado pero sí la distancia mostrada. "Ver mi posición" (solo con `alejado` y visita abierta)
  abre `MapaVisita` en `modo='consulta'` con watch de alta precisión que alimenta `evaluarFix`.
  No "arreglarlo" descartando todo fix con precisión > radio, ni restando la precisión en la salida.

## Cerrar la visita

- **Cerrar no tiene gate de distancia, pero pasa por el mapa si la coordenada definitiva lo ubica
  lejos.** `VisitaFlow.onCerrarVisita` mide con el `geo` de `capturarUbicacion()` (el mismo que se
  persiste como `coord_final`) y `estaFueraDeRango`: cerca cierra directo; lejos abre `MapaVisita`
  en `modo='cerrar'` y llama a `evaluarFix`. El disparador **no** es `alejado` (su watch se congela
  en background). El CTA de `'cerrar'` **nunca se deshabilita**: dice `Cerrar igual · estás a N m`
  (o `Cerrar igual` si el fix no prueba lejanía) con `ConfirmDialog`, o `Cerrar visita` directo si
  el punto cae dentro del círculo (`cercaSegunFix`, `distancia ≤ radio`; `avisarLejos`,
  `fixNoConcluyente`). La decisión viaja por `onCerrar(requiereConfirmacion)`; no recalcularla en
  `VisitaFlow`.
- **No hay tiempo mínimo para cerrar.** El gate de 15 minutos se sacó a propósito; no reponerlo.
  `useVisitaActiva` / `GET /planificacion/visitas/activa` siguen existiendo para el cronómetro y
  la agenda. La validez por duración es post-hoc, de analítica: el criterio vive en
  `pl_criterio_visita` (mínimo y máximo) de api-vendedores y el front lo lee de
  `GET /planificacion/analitica/criterio` (`useCriterioVisita`, `describirCriterio`). El valor
  vigente es el de la base, no el de ningún doc.
- **Mínimo de rubros para cerrar: `min(2, total ofrecidos)`** (`minimoRequerido` /
  `faltanParaMinimo` en `VisitaSheet.tsx`). Los rubros se cargan **durante** la visita: cerrada,
  el sheet es de consulta (`esEditable` = `!visitaCerrada`), así que lo que quedó sin cargar se
  pierde. No existe una pantalla de "completar después" ("quedaron N sin cargar", no "te quedan").
- **El gate de cierre depende de que los ofrecimientos hayan cargado.** Con el GET en vuelo o
  fallado, `ofrecimientos` es `[]` y `min(2, 0)` se auto-satisface: el botón solo se renderiza con
  `ofrecimientosCargados` (mientras, spinner o error con "Volver a intentar"). El gate es solo del
  front: `PUT /visitas/:id/cerrar` acepta cerrar con cero resoluciones.
- **"No visité" también con la visita abierta**: botón en la línea de identidad del header de
  `VisitaSheet` y "Reagendar → No visité" de la card. Los dos llaman a
  `POST /planificacion/visitas/:id/no-visita`, que **convierte** la resolución abierta (crear otra
  rebota con `VISITA_ACTIVA_EXISTENTE`). No captura ubicación y no borra los rubros cargados.
- **Reagendar mueve `(semana, dia)` y deja al cliente pendiente.** El estado tiene cuatro valores:
  `pendiente | en_curso | visitada | no_visita`; no hay `reagendada`. Las resoluciones no se editan
  ni se reabren, y una fila resuelta ya no se reacomoda (`FILA_RESUELTA`).
- **Al cerrar, el backend avisa a Cromo** (`CrmEventoVisitaService.notificar`), después de
  persistir el hecho y sin bloquear: un Cromo caído es un mensaje demorado, no un dato perdido. El
  front no llama a Cromo.

## Visita de alta ("Cliente nuevo") y datos del comercio

- **El alta es una fila del plan con `tipo='alta'`**, código sintético `ALTA-<id>`. Sin propuesta y
  sin gate de distancia; para iniciar abre `MapaVisita` en `modo='ubicar'` ("Tocá el mapa donde
  está el comercio"), y al cerrar entra igual al desvío por lejanía. Gate de cierre propio
  (`pideDatosAlta`, `puedeCerrarAlta`). Detalle en [`modelo.md`](modelo.md), "La visita de alta".
  La entrada se prende/apaga con `ALTAS_HABILITADAS` en `src/lib/flags.ts`.
- **El relevamiento del alta se dibuja desde `GET /planificacion/altas/esquema`**: la lista de
  campos vive en `esquemaAlta.ts` de api-vendedores. Tipos cerrados
  (`texto | textoLargo | cuit | email | catalogo`): uno nuevo se agrega en el validador de la API y
  en `CampoInput` de `RelevamientoSheet`. `requerido` (solo `nombre`) traba el Guardar;
  `obligatorio` traba el cierre de la visita (gate solo del front).
- **"Sacar de mi agenda" solo para lo agregado a mano** (`es_extra = 1`) y pendiente. Es un
  soft-delete de la fila, no un hecho; una fila planificada rebota `409 FILA_PLANIFICADA`.
- **"Datos del comercio" es una ficha del cliente y el formulario lo dibuja el catálogo**
  (`GET /planificacion/ficha/campos`, `useCamposFicha`, `PerfilComercioSheet` elige el control por
  `tipo` + `multiple`; `descripcion` es texto de pantalla). Agregar una opción es un `UPDATE` en
  `pl_ficha_campo`. "Otros" es una opción `abierta: true` y se guarda el texto, no el código. Lo
  único hardcodeado: Monomarca dispara la pregunta de la marca (`ESPECIALIDAD_CON_DETALLE`). Sin
  catálogo cargado no se dibuja el botón del pie (misma trampa que `ofrecimientosCargados`).
- **El gate de la ficha corta en `VisitaFlow.onConfirmarPropuesta`, antes del mapa.** El
  `PUT /planificacion/clientes/:codigo/ficha` va antes del POST de la visita. `onIniciar` conserva
  un chequeo de red (`!fichaLista && relevamientoPendiente(cliente)`) que **excluye al alta**: al
  alta la ficha se le pide con la visita ya abierta. Cerrar el formulario cierra la card
  (`cerrarFlujo()`).

## Cronómetro de la visita abierta

- `src/lib/estadoDuracion.ts` es la única fuente del color: ámbar <15 min, verde 15–90 (bordes
  inclusive), ámbar >90, y `alejado` (rojo) gana. Lo usan `VisitaEnCursoBar` y `VisitaSheet`.
  Estos umbrales son de UI, **no** el criterio de validez de la base, y no se sincronizan con él.
  `larga` es ámbar y no rojo a propósito: rojo es solo `alejado`.
- `VisitaSheet` recibe `alejado` combinado con `esClienteEnCurso`: el vendedor puede mirar otro
  cliente mientras la visita corre.
- El inicio lo manda el servidor (`GET /visitas/activa`, `fechaInicio`, en `useVisitaTimer`);
  `visita-inicio-<id>` en localStorage es solo caché.

## Tabla de rubros de la visita (UI)

- Chip de estado del rubro = checklist: anillo hueco `border-2 border-dsnavy` (pendiente) → número
  ámbar → ✓ verde. No usar ＋ ahí: ＋ es el verbo de las filas del **catálogo** (otros rubros), que
  agregan el rubro a la visita, y va gris pelado, más discreto que el chip (`conChip` incluye
  `|| f.agregable` para reservar el slot).
- La fila tiene dos zonas sin ícono: chip + nombre carga el resultado; los números despliegan las
  marcas del cliente en ese rubro (todas, una fila abierta a la vez).
- `M.Ant` se esconde debajo de 360 px (breakpoint `xs` propio de `tailwind.config.cjs`). Header y
  celda van juntos (`hidden xs:block` / `hidden xs:flex`, clases distintas a propósito).
- El botón de cerrar va gris (`#F1F4F9`, texto `dsnavy`, `disabled:opacity-100`) mientras falten
  rubros y naranja cuando se puede cerrar; dice `Cargá N rubros más`.
- Las marcas del cliente son contexto vivo (`getRubroStatus` → `POST /sale/rubro/client-context`);
  lo que se congela es la marca ofrecida, en `pl_ofrecimiento_alcance` `tipo='marca'`.

## Descuentos por marca

- Salen de `cliente.brandDiscounts` (ya viaja en la card de la agenda); la derivación vive en
  `src/lib/descuentosMarca.ts` (`conDescuentos`, antes de armar las filas en `propuesta/filas.ts`).
- **Un suscriptor (`bonusDiscount` 45 o 49) no ve descuentos por marca**, ve un chip que lo
  explica. No copiar el filtro `general_discount <> 45` de `clientService.getBrandDiscounts` de
  api-vendedores: esa columna vale 0 para todos y el filtro no hace nada.

## Sesión, roles y vendedor de prueba

- **Cerrar sesión limpia todo lo local de la sesión**: `cerrarSesionLocal()` en
  `src/lib/sesionLocal.ts` borra `access_token`, `visita-en-curso` y toda clave `visita-*`, y vacía
  la caché de React Query. El 401 de `apiClient` limpia el storage y recarga; un token por URL
  distinto al guardado también limpia (`adoptarTokenDeUrl` en `main.tsx`). Motivo: las query keys
  no llevan usuario y con `staleTime` 5 min + `refetchOnMount: false` el siguiente usuario del
  mismo teléfono veía la agenda del anterior. Algo nuevo de sesión en storage va con prefijo
  `visita-` o se suma a esa función.
- **El front no tiene tabla de roles**: decide con las capacidades de `GET /planificacion/me`;
  `src/lib/roles.ts` solo las traduce a rutas. Una pantalla que necesite "quién puede" es una
  capacidad nueva en el backend, no un `if (rol === ...)`.
- **El vendedor de prueba (`PRUEBA-<userId>`) es una identidad, no un modo**: gerencia y `tester`
  operan la app como su vendedor sintético. Ver [`modelo.md`](modelo.md), "El vendedor de prueba".

## Pantallas y alcance

Rutas (`src/App.tsx`): vendedor `/` (agenda) y `/metricas`; gerencia `/analitica`,
`/analitica/actividad`, `/analitica/vendedor/:codigo`, `/analitica/ruta` (edición de la rotación
con drag & drop), `/analitica/altas`, `/analitica/fichas`; además `/login` y `/sin-permisos`.

**Contactos en gerencia (visitas y llamados).** Actividad y el detalle del vendedor leen
`GET /analitica/contactos`: visitas y llamados de Televentas mezclados, cada fila con su `canal`
(`visita` | `llamado`; el chat sería un canal más). Los llamados se atribuyen al vendedor dueño del
cliente y muestran quién llamó. **No suman** a visitas, horas, cobertura ni efectividad: van con
contadores propios (tarjeta "Llamados", KPI de actividad). Los "No visité" viajan en el mismo feed
pero no son un contacto. El filtro de canal vive en la URL (`canal`); la validez implica visitas,
así que prenderla saca el canal y elegir "Llamados" apaga la validez.

En actividad, los KPI salen de `conteos` (totales de todo el filtro que calcula el back), nunca de
las filas cargadas: la tabla pagina de a 100 con "Mostrar más", y contar filas cortaba los números
en cuanto el rango pasaba de una página. Los conteos ignoran canal y validez (filtran la tabla, no
los KPI). El filtro de TV ("Televentas", `tvs` en la URL, `autores[]` en la API) filtra por quién
llamó y fija el canal en "Llamados", porque un TV no visita; pasar a "Todo" o "Visitas" suelta los
TV. La columna "Quién" es quien hizo el contacto: el vendedor en la visita, el TV en el llamado
(con "cliente de …" debajo).

**Métricas de gerencia (`/analitica/metricas`).** Tres vistas (`vista` en la URL): Productividad,
Ranking de objeciones y Facturación, con el tipo de persona siempre a la vista y filtrable (`tipo`):
VENDEDOR (vendedor de calle) y FARMER / HUNTER (el perfil del TV en `pl_tv.perfil`; un TV sin
perfil se ve como "TV sin perfil" y solo entra con "Todos"). Es el único ranking entre vendedores
del front y es solo de gerencia: el vendedor sigue viendo solo sus números en `/metricas`.
- Productividad: cada persona contra su objetivo; el vendedor por visitas válidas
  (`pctCumplimientoVisitas` de `/analitica/resumen`, que viene en 0..100), el TV por llamados contra
  la meta diaria de su perfil (`/analitica/televentas/productividad`, en 0..1). Visitas y llamados no
  se suman. Semáforo de `tonoCumplimiento`, el mismo que "Mis métricas".
- Objeciones (`/analitica/objeciones/por-persona`): visitas y llamados juntos, por quien registró
  el motivo. La tarjeta se recuenta desde las personas del recorte, así con un tipo elegido la
  tarjeta y la tabla dicen lo mismo.
- Facturación (`POST /sale/analytics`, el mismo pedido que "Vendedores · TODOS" de Versus): filas
  = carteras (vendor_code), no personas. Su tipo es el perfil de los TV activos que la atienden
  (`carteras` de `/analitica/televentas`; puede haber farmer y hunter a la vez) o VENDEDOR si no la
  atiende ninguno; sin ese dato (back viejo) dice "Sin tipo", no VENDEDOR. Colores contra P.6M y
  PROY con la misma regla de Versus (`src/lib/facturacion.ts`, `src/lib/proyeccionVentas.ts`,
  copiados de app-vendedores: si cambian allá, se cambian acá). No usa el período de la pantalla.

Fuera de alcance salvo pedido explícito: novedades para el vendedor, link de
WhatsApp al cliente, recorrido continuo de la visita o del día (requiere app nativa), control
minuto a minuto de un vendedor.
