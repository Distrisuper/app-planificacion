import { apiClient } from './apiClient'
import type {
    IReacomodarDTO,
    IRotacionCompleta,
    IRotacionResumen,
} from '@/types/planificacion'

/**
 * Las llamadas de GERENCIA sobre la rotación de otro vendedor.
 *
 * Separado de `planificacion.ts` a propósito: allá el vendedor sale del token y no viaja
 * en la URL; acá el vendedor es un parámetro y el permiso lo da el rol. Mezclarlos haría
 * fácil llamar por accidente a la variante que no corresponde.
 */

/** Los códigos de vendedor tienen espacios ("V 2"): sin encodear, el path se rompe. */
const base = (codigo: string) =>
    `/planificacion/vendedores/${encodeURIComponent(codigo)}/rotaciones`

/** La cola operable: la rotación vigente y las programadas en orden. */
export const getRotaciones = async (codigo: string): Promise<IRotacionResumen[]> => {
    const res = await apiClient.get(base(codigo))
    return res.data.data
}

/** El grid completo de una rotación: semanas × días × clientes. */
export const getRotacion = async (
    codigo: string,
    rotacionId: number,
): Promise<IRotacionCompleta> => {
    const res = await apiClient.get(`${base(codigo)}/${rotacionId}`)
    return res.data.data
}

/** Encola una rotación programada nueva, materializada contra el template de ahora. */
export const crearRotacion = async (codigo: string): Promise<number> => {
    const res = await apiClient.post(base(codigo))
    return res.data.data.rotacionId
}

/** Mueve una fila del plan de día y/o semana. Sin `semana`, solo cambia el día. */
export const reacomodarAdmin = async (
    codigo: string,
    rotacionId: number,
    rotacionClienteId: number,
    dto: IReacomodarDTO,
): Promise<void> => {
    await apiClient.patch(
        `${base(codigo)}/${rotacionId}/rotacion-cliente/${rotacionClienteId}/reacomodar`,
        dto,
    )
}

/** Cambia la posición de una programada en la cola (1 = la próxima en activarse). */
export const reordenarRotacion = async (
    codigo: string,
    rotacionId: number,
    orden: number,
): Promise<void> => {
    await apiClient.patch(`${base(codigo)}/${rotacionId}/orden`, { orden })
}

/** Cancela una programada. La vigente y las cerradas rebotan 409. */
export const cancelarRotacion = async (
    codigo: string,
    rotacionId: number,
): Promise<void> => {
    await apiClient.delete(`${base(codigo)}/${rotacionId}`)
}

export const editarDescripcionRotacion = async (
    codigo: string,
    rotacionId: number,
    descripcion: string | null,
): Promise<void> => {
    await apiClient.patch(`${base(codigo)}/${rotacionId}`, { descripcion })
}

/** Nombra una semana (ej. "Buenos Aires"). Funciona aunque la semana esté vacía. */
export const editarDescripcionSemana = async (
    codigo: string,
    rotacionId: number,
    semana: number,
    descripcion: string | null,
): Promise<void> => {
    await apiClient.patch(`${base(codigo)}/${rotacionId}/semanas/${semana}`, {
        descripcion,
    })
}
