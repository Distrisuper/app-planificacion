import { queryClient } from '@/lib/queryClient'

/**
 * Todo lo que la app deja en el dispositivo y pertenece a la SESIÓN, no al dispositivo.
 *
 * Existe porque cerrar sesión borraba solo `access_token`, y lo demás sobrevivía al
 * usuario siguiente en el mismo teléfono:
 *
 * - `visita-en-curso` (src/lib/visitaEnCurso.ts): el puntero a la visita abierta. La
 *   agenda arranca leyéndolo, y el efecto que lo reconcilia contra el servidor solo lo
 *   suelta cuando la agenda que llega NO trae ese cliente en curso.
 * - `visita-borrador-<id>`, `visita-detalles-<id>`, `visita-observaciones-<id>`,
 *   `visita-marcas-<id>` (resolucionDraft.ts) y `visita-inicio-<id>` (visitaTimer.ts):
 *   indexados por visitaId, así que en producción no chocan entre usuarios, pero se
 *   acumulan para siempre y en dev un reset de la base que reusa ids hace arrancar el
 *   cronómetro de la visita nueva desde un timestamp viejo.
 * - La caché de React Query, que vive en memoria: las keys de agenda y ciclo son fijas
 *   (`['agenda','semana']`, `['ciclo','actual']`, sin el usuario adentro) y con
 *   `staleTime` de 5 min + `refetchOnMount: false`, quien entra después ve la agenda del
 *   anterior sin una sola petición al servidor — y como esa agenda SÍ trae al cliente de
 *   `visita-en-curso` como `en_curso`, la barra flotante del otro usuario queda viva.
 *   Los dos problemas se refuerzan; por eso se limpian juntos.
 */

const TOKEN = 'access_token'
/** Prefijo común de todo lo que guardan visitaEnCurso, resolucionDraft y visitaTimer. */
const PREFIJO_VISITA = 'visita-'

/** Borra del storage todo lo de visitas, sin tocar el token: para cuando el backend borró
 *  las visitas pero la sesión sigue (reiniciar el modo prueba). */
export function limpiarVisitasLocales(): void {
    // Se recolectan primero: borrar mientras se itera por índice saltea claves.
    const deVisitas: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k !== null && k.startsWith(PREFIJO_VISITA)) deVisitas.push(k)
    }
    deVisitas.forEach(k => localStorage.removeItem(k))
}

/** Borra del storage el token y todo lo de visitas. No toca la memoria: para el 401 de
 *  apiClient (que recarga la página, así que la memoria se vacía sola) y para antes de
 *  montar React (main.tsx), cuando todavía no hay nada en memoria. */
export function limpiarStorageSesion(): void {
    localStorage.removeItem(TOKEN)
    limpiarVisitasLocales()
}

/** Cerrar sesión desde la app: storage + caché en memoria. */
export function cerrarSesionLocal(): void {
    limpiarStorageSesion()
    queryClient.clear()
}

/**
 * Un token que llega por URL (desde Lupa / app-vendedores) pisa al guardado. Si es de
 * OTRA sesión, lo anterior se limpia primero: sin esto, entrar por link con otro usuario
 * dejaba el puntero de visita y los borradores del anterior.
 */
export function adoptarTokenDeUrl(token: string): void {
    if (localStorage.getItem(TOKEN) !== token) limpiarStorageSesion()
    localStorage.setItem(TOKEN, token)
}
