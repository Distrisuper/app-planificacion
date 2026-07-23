# app-planificacion — Login propio (auth con usuario/contraseña)

Fecha: 2026-07-23
Estado: Aprobado para pasar a plan de implementación

## 1. Contexto

El MVP original (spec `2026-07-22-app-planificacion-design.md`, plan
`2026-07-22-frontend-app-planificacion.md`) asumía que el vendedor **siempre** entra a esta app
desde un link con `?token=<jwt>` generado por otra app ya autenticada (Versus/Lupa). En la
práctica, al probar la app recién armada, no había forma simple de entrar sin ya tener una sesión
activa en otro lado — no tiene sentido depender de loguearse en Versus para poder abrir esta app.

Al mismo tiempo, se detectó un problema de UX real probando en local: si el token en
`localStorage` pertenece a un usuario cuyo rol no es `vendedor`, el backend devuelve `403` en
**todos** los endpoints de `/planificacion/*` (`authorize('vendedor')` en
`api-vendedores/src/middleware/authorize.ts`), y la app no tenía ninguna forma de explicarle esto
al usuario — quedaba con pantallas vacías/errores de red poco claros.

**Hallazgo clave:** `app-vendedores` (repo hermano) ya resuelve exactamente este problema con su
propio `AuthContext` (`src/context/AuthContext.tsx`) + `LoginPage` (`src/pages/LoginPage.tsx`),
contra los mismos endpoints de auth que esta app ya declara en su `.env-example`
(`VITE_API_AUTH_URL=https://apidistri.distrisuper.com`):

- `POST {authUrl}/api/lupita/login` con `{ email, password }` → `{ message: 'success',
  access_token }`.
- `GET {authUrl}/api/auth/me` con `Authorization: Bearer <token>` → datos del usuario:
  `{ id, name, surname, email, rol, codigoparticular, ... }`. Este es el MISMO endpoint que el
  backend (`api-vendedores/src/services/authService.ts`) usa para validar el token del lado del
  servidor — o sea, el rol que devuelve es el mismo que `authorize('vendedor')` va a chequear
  después.

Este diseño porta ese patrón (adaptado al estilo visual y alcance de esta app), en vez de agregar
solo una pantalla de login suelta.

## 2. Alcance

**Incluido:**
1. Pantalla de login propia (usuario/contraseña) en `/login`, con el mismo layout/estilo visual
   que `app-vendedores/src/pages/LoginPage.tsx` (decisión explícita: consistencia visual con la app
   hermana, no con el diseño mobile-first del resto de esta app).
2. El flujo `?token=` existente (Task 4 del plan original) **se mantiene intacto** — conviven
   ambos: si la URL trae `?token=`, se usa directo; si no hay token (ni en URL ni en
   `localStorage`), se muestra `/login`.
3. **Validación de rol del lado del cliente, antes de tocar `/planificacion/*`**: al validar
   cualquier token (por login o por `?token=`), se llama a `GET /api/auth/me`. Si `rol` (case
   -insensitive) no es `vendedor`, se corta ahí: se limpia el token y se muestra un mensaje
   específico ("Tu usuario no tiene permisos de vendedor"), sin llegar a pegarle a los endpoints de
   agenda/visitas y toparse con el 403 genérico del backend.
4. **Nombre real del vendedor en `AppHeader`** — dato que ya viene en la misma respuesta de
   `/api/auth/me` (`name`), resolviendo de paso el "known follow-up" que había quedado pendiente en
   el plan original (`AppHeader` recibía `vendedorNombre=""` hardcodeado).
5. **Botón de "Cerrar sesión"** en `AppHeader` — limpia el token y vuelve a `/login`.

**Explícitamente fuera de alcance:**
- Recordar sesión más allá de lo que ya hace `localStorage` (no hay "recordarme"/refresh tokens
  nuevos — se sigue con el mismo access_token simple).
- Recuperación de contraseña / registro de usuario (eso vive en el sistema de auth central, no en
  esta app).
- Cambiar el rango de roles permitidos: solo `vendedor` (igual que hoy hace
  `authorize('vendedor')` en el backend) — no se agregan roles adicionales "para probar".
- Semana/rango real en `AppHeader` (`rangoSemana`) — sigue como known follow-up aparte, no lo toca
  este cambio.

## 3. Arquitectura

Se agrega un `AuthContext` (`src/context/AuthContext.tsx`) que envuelve la app **dentro** de
`QueryClientProvider` y **fuera** de `BrowserRouter` (necesita `useNavigate`/rutas, así que en
realidad va dentro de `BrowserRouter` — ver diagrama). Reemplaza el chequeo actual, puramente
sincrónico, de `ProtectedRoute` (`localStorage.getItem('access_token')` a secas) por un flujo con
estado: `authLoading` (validando token) → `isAuthenticated` (rol `vendedor` confirmado) |
`unauthorized` (token válido pero rol incorrecto) | no autenticado.

```
main.tsx (captura ?token= → localStorage, como hoy, sin cambios)
  └─ App.tsx
       └─ QueryClientProvider
            └─ BrowserRouter
                 └─ AuthProvider                    (NUEVO)
                      ├─ /login          → LoginPage       (NUEVO, sin ProtectedRoute)
                      ├─ /sin-permisos   → mensaje de rol incorrecto (NUEVO, reemplaza /sin-acceso)
                      └─ ProtectedRoute (usa useAuth().isAuthenticated)
                           └─ /            → AgendaSemanaPage (usa useAuth().user.name para el header)
```

`apiClient.ts` (Task 5) **no cambia** — sigue siendo el cliente para `/planificacion/*` y
`/sale/*`. Las llamadas de auth (`/api/lupita/login`, `/api/auth/me`) van por un cliente axios
aparte (`authApiClient`, sin interceptor de Bearer-desde-localStorage ya que el token todavía no
existe en el momento del login) apuntando a `VITE_API_AUTH_URL`, igual que hace
`app-vendedores/src/api/api_http.ts`.

## 4. Componentes nuevos/modificados

### `src/api/authApi.ts` (nuevo)
- `login(email: string, password: string): Promise<{ token: string } >` — llama
  `POST {authUrl}/api/lupita/login`; lanza si `message !== 'success'` (credenciales incorrectas).
- `getMe(token: string): Promise<{ id, name, rol, ... }>` — llama `GET {authUrl}/api/auth/me` con
  el Bearer pasado explícitamente (no vía `apiClient`, para no depender del token ya estar en
  `localStorage`).

### `src/context/AuthContext.tsx` (nuevo)
- Estado: `status: 'loading' | 'authenticated' | 'unauthorized' | 'unauthenticated'`,
  `user: { name: string; rol: string } | null`, `loginError: string | null`,
  `loginLoading: boolean`.
- `login(email, password)`: llama `authApi.login`, guarda el token, corre la misma validación de
  rol que el flujo de `?token=`/`localStorage` (reutiliza una función interna `validateAndSetUser`).
- `logout()`: limpia `localStorage['access_token']` y el estado, no hace falta redirigir a mano —
  el `status` vuelve a `'unauthenticated'` y las rutas reaccionan solas.
- Al montar: replica la lógica de `main.tsx`'s captura de `?token=` (que ya deja el token en
  `localStorage` ANTES de que React monte) — simplemente lee `localStorage['access_token']` si
  existe y corre `validateAndSetUser`; si no hay token, `status = 'unauthenticated'`.
- `validateAndSetUser(token)`: llama `authApi.getMe(token)`. Si falla (401/red) → limpia token,
  `status = 'unauthenticated'`. Si responde pero `rol.toLowerCase() !== 'vendedor'` → NO limpia el
  token todavía (se limpia recién si el usuario confirma/reintenta desde la pantalla de
  sin-permisos, para no perder el error de diagnóstico a mitad de camino) — `status =
  'unauthorized'`, guarda `user` igual (para poder mostrar "Hola {name}, tu rol es {rol}..." si
  hace falta). Si el rol es correcto → `status = 'authenticated'`, guarda `user`.

### `src/pages/LoginPage.tsx` (nuevo)
- Réplica del layout de `app-vendedores/src/pages/LoginPage.tsx` (mismo fondo, misma tarjeta
  blanca, mismos inputs usuario/contraseña con toggle de mostrar contraseña, mismo botón azul) —
  cambiando únicamente el título de la barra ("Versus" → "Planificación" o similar, a definir en
  implementación) y el texto del botón/estados de carga usando `loginLoading`/`loginError` de
  `useAuth()`.
- Si `isAuthenticated` ya es `true` al montar (ej. alguien navega a `/login` con sesión activa),
  redirige a `/`.

### `src/pages/SinPermisosPage.tsx` (nuevo, reemplaza el `<div>` inline de `/sin-acceso`)
- Mensaje: "Tu usuario no tiene permisos de vendedor para acceder a esta aplicación." + botón
  "Volver a intentar" que llama `logout()` (limpia el token y vuelve a `/login` para probar con
  otra cuenta).

### `src/router/ProtectedRoute.tsx` (modificado)
- Pasa de leer `localStorage` directamente a usar `useAuth()`:
  - `status === 'loading'` → spinner/placeholder simple (nada que testear a fondo, solo evitar un
    parpadeo a `/login` mientras se valida).
  - `status === 'authenticated'` → `<Outlet />`.
  - `status === 'unauthorized'` → `<Navigate to="/sin-permisos" replace />`.
  - `status === 'unauthenticated'` → `<Navigate to="/login" replace />`.

### `src/App.tsx` (modificado)
- Envuelve las rutas en `<AuthProvider>`. Agrega `<Route path="/login" element={<LoginPage />} />`
  y `<Route path="/sin-permisos" element={<SinPermisosPage />} />`, quita la ruta `/sin-acceso`
  inline actual.

### `src/components/AppHeader.tsx` (modificado)
- Agrega prop `onLogout?: () => void`. Si está presente, muestra un botón/ícono chico (ej. ícono de
  `lucide-react`, `LogOut`) al lado del nombre del vendedor.
- `AgendaSemanaPage` pasa `vendedorNombre={user?.name ?? ''}` (de `useAuth()`) y
  `onLogout={logout}` en vez del string vacío hardcodeado de hoy.

## 5. Manejo de errores

- **Login con credenciales incorrectas**: `authApi.login` rechaza → `AuthContext.login` setea
  `loginError` (ej. "Usuario o contraseña incorrectos"), `LoginPage` lo muestra igual que hoy hace
  `app-vendedores`.
- **Rol incorrecto**: como se detalla arriba, no es un "error" de login (las credenciales eran
  válidas) — es un estado propio (`unauthorized`) con su propia pantalla, no un mensaje de error en
  el form de login.
- **`/api/auth/me` cae (timeout/500) durante la validación inicial**: se trata igual que "no
  autenticado" (limpia token, vuelve a `/login`) — no se distingue de un token inválido, para no
  complicar el estado; si esto genera fricción real más adelante (ej. reintentos automáticos), es
  un follow-up aparte.
- El interceptor 401 de `apiClient.ts` (Task 5, ya existente) sigue funcionando igual para
  `/planificacion/*`/`/sale/*` — no se toca. La app ahora simplemente evita llegar a ese 401 en el
  caso común (rol incorrecto) validando antes por su cuenta.

## 6. Testing

- `AuthContext`: tests de `validateAndSetUser` cubriendo los 3 resultados (rol correcto, rol
  incorrecto, token inválido/error de red), mockeando `authApi`.
- `LoginPage`: test de submit exitoso (llama `login` con los valores del form) y de error mostrado
  cuando `loginError` está seteado — sin pegarle a un backend real (mock de `useAuth`/`AuthContext`
  o del propio `authApi`).
- `ProtectedRoute`: actualizar sus tests existentes (Task 6) para cubrir los 4 estados
  (`loading`/`authenticated`/`unauthorized`/`unauthenticated`) en vez de solo
  presencia/ausencia de token.
- `AppHeader`: test de que el botón de logout aparece solo si se pasa `onLogout` y lo dispara al
  clickearlo.

## 7. Traza a la conversación que originó esto

- Motivo original: al abrir la app en local sin haber pasado por Versus, no había token válido →
  toda la agenda daba 403 sin explicación.
- Decisión explícita del usuario: login propio **convive** con `?token=` (no lo reemplaza); mismo
  estilo visual que `app-vendedores` (no el estilo mobile-first del resto de esta app); rol
  incorrecto se detecta y muestra mensaje claro; sí hay botón de logout visible.
