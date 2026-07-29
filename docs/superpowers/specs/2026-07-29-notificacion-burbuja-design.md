# Notificación tipo burbuja (reemplaza el toast)

## Contexto

Hoy `Toast`/`useToast` (`src/components/ui/toast.tsx`, `src/hooks/useToast.ts`) es un pill
fijo abajo al centro, con un ✓ verde fijo sin importar el contenido, que se auto-oculta a los
1.9s. Es el único mecanismo de notificación de la app (usado solo desde `AgendaSemanaPage`, para
reagendar/registrar/cerrar semana y para avisos de error de `VisitaFlow`). El problema
concreto que lo disparó: al fallar "iniciar visita" en el mapa full-screen nuevo, el toast queda
tapado por el botón de esa misma pantalla y desaparece demasiado rápido para leerlo, y su ✓ verde
confunde éxito con error.

El usuario pidió un componente estándar, con el aspecto de una notificación nativa de Android
(burbuja arriba al centro, ícono circular + texto), para reusar en cualquier aviso: errores,
inicio de visita, finalización, etc.

## Diseño

### `Notification` (nuevo, reemplaza `Toast`)

- Ubicación: `src/components/ui/Notification.tsx` (reemplaza `toast.tsx`).
- Fixed, arriba al centro: `top: max(0.75rem, env(safe-area-inset-top))`, `left-1/2
  -translate-x-1/2`, `z-[70]` (igual que el toast actual).
- Estructura: círculo de ícono a la izquierda (color según tipo) + columna de texto (label en
  negrita arriba, mensaje debajo en gris). Fondo blanco, sombra, `rounded-2xl`, ancho máximo
  ~90vw con `truncate`/wrap según largo.
- Tipos (`exito` | `error` | `info`):
  - `exito`: círculo verde (`dsgreen`), ícono `Check`, label **"Listo"**.
  - `error`: círculo rojo (`dsred`), ícono `AlertTriangle`, label **"Error"**.
  - `info`: círculo navy (`dsnavy`), ícono `Info`, label **"Aviso"**.
  - El label lo pone el componente según `tipo`; el texto que ya se pasa hoy a `showToast(...)`
    pasa a ser el `mensaje` (sin tocar la redacción de los mensajes existentes).
- Animación: nuevo keyframe `notif-in` (slide-down + fade, análogo al `toast-in` existente pero
  entrando desde arriba: `translateY(-10px) → 0`), respetando `prefers-reduced-motion` como los
  demás.
- Tocar la burbuja la cierra antes de que expire el timer.

### `useNotificacion` (nuevo, reemplaza `useToast`)

- `src/hooks/useNotificacion.ts`.
- `const { notificacion, mostrar } = useNotificacion()`, `mostrar(tipo, mensaje)`.
- Duración: `exito`/`info` 2000ms, `error` 4500ms (los errores necesitan más tiempo de lectura).
- Igual que hoy: una nueva llamada a `mostrar` reemplaza la notificación visible y resetea el
  timer (no hay cola/apilado).

### Migración de `AgendaSemanaPage`

- `showToast(msg)` → `mostrar('exito' | 'error', msg)` según corresponda cada callsite actual:
  - Éxito: "Semana N abierta...", "Cliente reagendado", "Registrado", "Semana cerrada".
  - Error: mensajes de `MENSAJE_GEO`, "No se pudo abrir/reagendar/registrar...", "Este cliente ya
    fue resuelto...".
- `<Toast message={toastMessage} />` → `<Notification notificacion={notificacion} />`.
- Se borran `toast.tsx` y `useToast.ts` (sin otros usos en el repo).

## Fuera de alcance

- Cola/apilado de múltiples notificaciones simultáneas (se mantiene el comportamiento actual de
  reemplazo).
- Los banners inline persistentes de `PropuestaSheet`/`IniciarVisitaMapa` (atados a un botón de
  reintentar) no se tocan — son un patrón distinto, no una notificación global.
