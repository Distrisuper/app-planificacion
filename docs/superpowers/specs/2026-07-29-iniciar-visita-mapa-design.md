# Iniciar visita: mapa, estado "en curso" y minimizar

## Contexto

Hoy "iniciar visita" es un botón dentro de `PropuestaSheet` que captura el GPS en silencio
(`capturarUbicacion()`) y llama a la mutación sin que el vendedor vea nada de ubicación. Al
tener éxito se pasa directo a `VisitaSheet` (carga de rubros). El estado "en curso" ya existe
en el modelo (`EstadoCicloCliente = 'en_curso'`) y ya se pinta como pill naranja en
`ClienteCard`, pero no hay ningún indicador dentro del flujo de la visita en sí, ni forma de
"minimizar" y seguir viendo que hay una visita abierta mientras se navega la agenda.

## Objetivo

1. Mostrar un mapa con la ubicación del vendedor y la del cliente antes de iniciar, para que
   el vendedor confirme visualmente que está cerca (patrón estándar de apps de reparto/viajes).
2. Reflejar visualmente el estado "en curso" dentro del propio flujo de la visita, no solo en
   la card de la agenda.
3. Permitir "minimizar" la visita en curso a una barra flotante, para poder navegar la agenda
   sin perder de vista que hay una visita abierta.

## Diseño

### 1. `IniciarVisitaMapa` (nuevo componente, full-screen)

Se dispara al tocar "Iniciar visita" en `PropuestaSheet`, **solo si** `cliente.latitud` y
`cliente.longitud` están cargados. Si no hay coordenadas, se mantiene el comportamiento actual
(arranca directo) — no todos los clientes tienen geo cargada todavía.

- Overlay full-screen (no `BottomSheet`: un mapa necesita el alto completo), con:
  - Header simple: nombre del cliente + botón cerrar (X) que cancela y vuelve a la Propuesta
    sin iniciar nada.
  - Mapa Leaflet (tiles OpenStreetMap) centrado para mostrar ambos puntos:
    - Pin naranja fijo: ubicación del cliente (`cliente.latitud/longitud`).
    - Punto celeste: ubicación del vendedor, actualizada en vivo con
      `navigator.geolocation.watchPosition` mientras la pantalla está montada. Se limpia el
      watch al desmontar. **Esto es puramente visual y del lado del cliente** — no se manda al
      backend ni cambia la regla existente de "solo 2 puntos" (inicio/fin) que persiste
      `capturarUbicacion()`.
    - Si el vendedor deniega el permiso o no hay señal, se muestra solo el pin del cliente y un
      aviso chico ("No pudimos ubicarte, pero podés iniciar igual").
  - Panel inferior: dirección del cliente en texto + botón "Iniciar visita".
- Al tocar "Iniciar visita": se llama a `capturarUbicacion()` (la captura real, en dos etapas,
  igual que hoy) y con esa coordenada se llama a la mutación existente. Éxito → pasa a
  `VisitaSheet` (rubros), igual que el flujo actual. Error → mismo manejo que hoy
  (`onGeoBloqueada` / aviso de reintentar).

### 2. Indicador "en curso" en `VisitaSheet`

- Cuando la visita está en curso (no cerrada), el `eyebrow` de `VisitaSheet` cambia de
  "Propuesta comercial" a algo como "● En curso" en naranja (mismo tono que el pill de
  `ClienteCard`), y se agrega un cronómetro `mm:ss` del tiempo transcurrido desde el inicio.
- El inicio de la visita se guarda en `localStorage` (`visita-inicio-{visitaId}`) apenas la
  mutación de iniciar tiene éxito, para que el cronómetro sobreviva a cerrar/reabrir el sheet
  dentro de la misma sesión. Se limpia al cerrar la visita.

### 3. Minimizar → barra flotante

- `BottomSheet` suma un prop opcional `onMinimize`; cuando está presente, se renderiza un botón
  extra (chevron hacia abajo) al lado de la X en el header. La X sigue siendo "cerrar del todo".
- `VisitaSheet` pasa `onMinimize` solo cuando la visita está en curso (no tiene sentido
  minimizar una visita ya cerrada que solo se reabrió para completar rubros).
- Minimizar oculta el `BottomSheet` y `AgendaSemanaPage` renderiza una barra fija en la parte
  inferior de la pantalla (por encima de la agenda, por debajo de cualquier sheet) con: nombre
  del cliente + cronómetro + ícono de expandir. Tocarla reabre `VisitaSheet` tal cual estaba.
- Este estado de "minimizado" vive en memoria (estado de React en `AgendaSemanaPage`/
  `VisitaFlow`), no se persiste entre recargas de página — para ese caso ya existe el camino
  actual de tocar la card del cliente de nuevo, que reconstruye el flujo desde
  `cliente.estado`/`cliente.visitaId`.

## Componentes nuevos / modificados

- **Nuevo:** `src/components/IniciarVisitaMapa.tsx` (+ test)
- **Nuevo:** `src/components/VisitaEnCursoBar.tsx` (la barra flotante) (+ test)
- **Nuevo:** `src/lib/visitaTimer.ts` (helpers de localStorage + formateo mm:ss) (+ test)
- **Modificado:** `src/components/ui/BottomSheet.tsx` — prop `onMinimize` opcional
- **Modificado:** `src/components/VisitaSheet.tsx` — eyebrow/cronómetro "en curso", pasa
  `onMinimize`
- **Modificado:** `src/components/VisitaFlow.tsx` — orquesta el paso del mapa y el estado de
  minimizado
- **Modificado:** `src/pages/AgendaSemanaPage.tsx` — renderiza `VisitaEnCursoBar` cuando
  corresponde
- **Nueva dependencia:** `leaflet` (+ `@types/leaflet`). Se usa directo (sin `react-leaflet`)
  para evitar riesgo de compatibilidad de una lib de bindings con React 19.

## Fuera de alcance

- Tracking continuo del recorrido enviado al backend (sigue siendo solo 2 puntos: inicio/fin).
- Mostrar el mapa durante la carga de rubros (solo aparece antes de iniciar).
- Soportar más de una visita "en curso" en simultáneo.
- Persistir el estado de "minimizado" entre recargas de página/cierre de la PWA.
