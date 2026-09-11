/**
 * El semáforo de la visita EN VIVO: qué color y qué texto muestra el cronómetro
 * mientras la visita está abierta.
 *
 * Vive en un módulo propio y no en cada componente porque son DOS pantallas las que
 * lo pintan — la barra flotante (`VisitaEnCursoBar`) y el eyebrow del sheet
 * (`VisitaSheet`) — y son la misma visita: si cada una armara su color a mano,
 * minimizar el sheet podría cambiar de verde a ámbar sin que pasara nada.
 */

/**
 * Umbrales, en minutos, del semáforo. Son SOLO de UI: una guía para el vendedor
 * parado en el local, no un criterio de negocio.
 *
 * NO son el criterio de validez de la visita. Ese vive en `pl_criterio_visita`
 * (api-vendedores), no se expone por API, y hoy es "mínimo 15 minutos, sin techo"
 * — ver `DURACION_MIN_VALIDA` en `analiticaFormat.ts`. O sea que
 * `DURACION_LARGA_MIN` no invalida nada: una visita de 2 horas sigue siendo válida
 * para la analítica, y este ámbar solo le sugiere al vendedor que la cierre (lo
 * más probable es que se haya ido del local y se la haya olvidado abierta).
 *
 * Por eso tampoco hay que sincronizarlos con la base cuando el criterio cambie:
 * son independientes a propósito.
 */
export const DURACION_ARRANQUE_MIN = 15
export const DURACION_LARGA_MIN = 90

/**
 * - `alejado`: el vendedor está lejos del cliente con la visita abierta. Gana sobre
 *   cualquier duración — es el único de los cuatro que indica un problema real (la
 *   visita puede terminar sin validar por geo), y por eso es el único en rojo.
 * - `arranque`: todavía no llegó al piso de duración válida.
 * - `valida`: entre el piso y el techo. El único estado verde.
 * - `larga`: se pasó del techo. Ámbar, no rojo: ver nota de los umbrales.
 */
export type EstadoVisitaVivo = 'alejado' | 'arranque' | 'valida' | 'larga'

export function estadoVisitaVivo(segundos: number, alejado = false): EstadoVisitaVivo {
    if (alejado) return 'alejado'
    const minutos = segundos / 60
    if (minutos < DURACION_ARRANQUE_MIN) return 'arranque'
    if (minutos > DURACION_LARGA_MIN) return 'larga'
    return 'valida'
}

interface PaletaVisitaVivo {
    /** Fondo de la barra flotante (que es sólida y de color completo). */
    barra: string
    /** Color de texto del eyebrow del sheet (que va sobre blanco). */
    eyebrow: string
}

/**
 * Ámbar aparece dos veces a propósito (`arranque` y `larga`) para dejar el rojo
 * reservado 100% a `alejado`: si `larga` fuera rojo, rojo pasaría a significar dos
 * cosas y se diluiría justo el estado que importa. La ambigüedad entre los dos
 * ámbares no existe en la práctica — al lado del color está el cronómetro (`04:12`
 * vs `1:34:02`) y el texto, que sí los distinguen.
 *
 * `eyebrow` usa el hex crudo de `dsorange` porque es el valor que ya tenía
 * `VisitaSheet` hardcodeado; se deja igual para no cambiar el arranque, que es el
 * caso más común.
 */
export const PALETA_VISITA_VIVO: Record<EstadoVisitaVivo, PaletaVisitaVivo> = {
    alejado: { barra: 'bg-dsred', eyebrow: 'text-dsred' },
    arranque: { barra: 'bg-dsorange', eyebrow: 'text-[#B45309]' },
    valida: { barra: 'bg-dsgreen', eyebrow: 'text-dsgreen' },
    larga: { barra: 'bg-dsorange', eyebrow: 'text-[#B45309]' },
}

/** Rótulo del eyebrow del sheet, sin el cronómetro (lo concatena el llamador). */
export const ROTULO_VISITA_VIVO: Record<EstadoVisitaVivo, string> = {
    alejado: 'Te alejaste',
    arranque: 'En curso',
    valida: 'En curso',
    larga: 'Visita larga',
}
