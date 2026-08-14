import type { IAlcance } from '@/types/planificacion'

const TOPE_VISIBLE = 3

/** El mismo código puede existir como marca y como rubro: la identidad es el par. */
export const claveAlcance = (a: IAlcance): string => `${a.tipo}:${a.codigo}`

/** Agrega o saca un destino. El alcance es un CONJUNTO: no hay duplicados y el orden
 *  no significa nada. */
export function toggleAlcance(lista: IAlcance[], destino: IAlcance): IAlcance[] {
    const clave = claveAlcance(destino)
    return lista.some(a => claveAlcance(a) === clave)
        ? lista.filter(a => claveAlcance(a) !== clave)
        : [...lista, destino]
}

/** Texto corto para la tarjeta del ofrecimiento. Lista vacía = oferta global, y eso se dice
 *  explícito: "sin alcance" se leería como "falta cargar algo". */
export function resumenAlcance(lista: IAlcance[]): string {
    if (lista.length === 0) return 'Todo el cliente'

    const visibles = lista.slice(0, TOPE_VISIBLE).map(a => a.descripcion)
    const ocultos = lista.length - visibles.length
    const texto = visibles.join(' · ')
    return ocultos > 0 ? `${texto} +${ocultos}` : texto
}
