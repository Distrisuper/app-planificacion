import { apiClient } from './apiClient'
import type {
    IAgendaClientAdmin,
    IClienteEnRotacion,
    IClienteAgregadoRutaBase,
    IIntercambiarDiasDTO,
    IIntercambiarSemanasDTO,
    IReacomodarDTO,
    IResultadoBuscadorGeneral,
    IResultadoBuscadorRutaBase,
    IResultadoReacomodar,
    IResultadoReiniciarRotacion,
    IResultadoSincronizarRutaBase,
    IRotacionCompleta,
    IRotacionResumen,
    IRutaBase,
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

/** La ruta base del vendedor (`pl_ruta_cliente`): lo que se copia al armar cada vuelta. */
const baseRuta = (codigo: string) =>
    `/planificacion/vendedores/${encodeURIComponent(codigo)}/ruta-base`

export const getRutaBase = async (codigo: string): Promise<IRutaBase> => {
    const res = await apiClient.get(baseRuta(codigo))
    return res.data.data
}

/** Encola una rotación programada nueva, materializada contra el template de ahora. */
export const crearRotacion = async (codigo: string): Promise<number> => {
    const res = await apiClient.post(base(codigo))
    return res.data.data.rotacionId
}

/**
 * Cierra la vuelta actual del vendedor y arranca una nueva copiada de la ruta base. 409
 * VISITA_EN_CURSO si está visitando a alguien, 422 ROTACION_SIN_CLIENTES sin ruta base.
 */
export const reiniciarRotacion = async (
    codigo: string,
): Promise<IResultadoReiniciarRotacion> => {
    const res = await apiClient.post(`${base(codigo)}/reiniciar`)
    return res.data.data
}

/**
 * Mueve una fila del plan de día y/o semana. Sin `semana`, solo cambia el día. Con
 * `aplicarARutaBase`, el backend también lo mueve en la ruta base y dice si pudo.
 */
export const reacomodarAdmin = async (
    codigo: string,
    rotacionId: number,
    rotacionClienteId: number,
    dto: IReacomodarDTO,
): Promise<IResultadoReacomodar> => {
    const res = await apiClient.patch(
        `${base(codigo)}/${rotacionId}/rotacion-cliente/${rotacionClienteId}/reacomodar`,
        dto,
    )
    // Un backend anterior no devolvía data: equivale a no haber pedido la ruta base.
    return res.data.data ?? { rutaBase: null }
}

/** Quita una fila pendiente de la rotación (soft-delete). 409 si ya está resuelta o el
 *  vendedor la está visitando ahora mismo. */
export const quitarClienteAdmin = async (
    codigo: string,
    rotacionId: number,
    rotacionClienteId: number,
): Promise<void> => {
    await apiClient.delete(
        `${base(codigo)}/${rotacionId}/rotacion-cliente/${rotacionClienteId}`,
    )
}

/** Deshace un "quitar" (soft-delete). Sin límite de tiempo mientras la rotación siga
 *  editable. */
export const restaurarClienteAdmin = async (
    codigo: string,
    rotacionId: number,
    rotacionClienteId: number,
): Promise<void> => {
    await apiClient.patch(
        `${base(codigo)}/${rotacionId}/rotacion-cliente/${rotacionClienteId}/restaurar`,
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

/** Permuta dos días completos. Devuelve cuántas filas se movieron. */
export const intercambiarDias = async (
    codigo: string,
    rotacionId: number,
    dto: IIntercambiarDiasDTO,
): Promise<number> => {
    const res = await apiClient.post(
        `${base(codigo)}/${rotacionId}/intercambiar-dias`,
        dto,
    )
    return res.data.data.movidas
}

/** Permuta dos semanas enteras (clientes y nombre de zona). Solo semanas pendientes. */
export const intercambiarSemanas = async (
    codigo: string,
    rotacionId: number,
    dto: IIntercambiarSemanasDTO,
): Promise<number> => {
    const res = await apiClient.post(
        `${base(codigo)}/${rotacionId}/intercambiar-semanas`,
        dto,
    )
    return res.data.data.movidas
}

// ── Edición de la ruta base ──────────────────────────────────────────────────────
// Lo que cambia acá aplica desde la próxima vuelta: la vuelta en curso no se toca.

/** `posicion`: índice 0-based entre los activos del día destino. Ausente = al final. */
export const moverEnRutaBase = async (
    codigo: string,
    id: number,
    dto: { semana: number; dia: number; posicion?: number },
): Promise<void> => {
    await apiClient.patch(`${baseRuta(codigo)}/${id}`, dto)
}

/** Borrado lógico: la card queda con `eliminado` y se puede restaurar. */
export const quitarDeRutaBase = async (codigo: string, id: number): Promise<void> => {
    await apiClient.delete(`${baseRuta(codigo)}/${id}`)
}

/** Deshace un "quitar". 409 si el cliente ya volvió a estar en esa celda. */
export const restaurarEnRutaBase = async (codigo: string, id: number): Promise<void> => {
    await apiClient.post(`${baseRuta(codigo)}/${id}/restaurar`)
}

/** Agrega una semana vacía al final (la N+1). Devuelve su número. */
export const agregarSemanaRutaBase = async (codigo: string): Promise<number> => {
    const res = await apiClient.post(`${baseRuta(codigo)}/semanas`)
    return res.data.data.semana
}

/** Lleva la semana a la posición 1..N; el back renumera las demás. */
export const moverSemanaRutaBase = async (
    codigo: string,
    dto: { semana: number; posicion: number },
): Promise<void> => {
    await apiClient.post(`${baseRuta(codigo)}/semanas/mover`, dto)
}

/**
 * Reemplaza los días de una semana con los códigos pegados. `dias` va con clave "1".."5";
 * los días que no vienen no se tocan. `aplicar: false` es la vista previa y no cambia nada.
 */
export const sincronizarRutaBase = async (
    codigo: string,
    dto: { semana: number; dias: Record<string, string[]>; aplicar: boolean },
): Promise<IResultadoSincronizarRutaBase> => {
    const res = await apiClient.post(`${baseRuta(codigo)}/sincronizar`, dto)
    return res.data.data
}

/** Busca en la cartera del vendedor, con las celdas de la ruta base donde ya está. */
export const buscarEnRutaBase = async (
    codigo: string,
    texto: string,
): Promise<IResultadoBuscadorRutaBase[]> => {
    const res = await apiClient.get(`${baseRuta(codigo)}/buscador`, { params: { q: texto } })
    return res.data.data
}

export const agregarARutaBase = async (
    codigo: string,
    dto: { codigoCliente: string; semana: number; dia: number },
): Promise<IClienteAgregadoRutaBase> => {
    const res = await apiClient.post(`${baseRuta(codigo)}/clientes`, dto)
    return res.data.data
}

export const intercambiarDiasRutaBase = async (
    codigo: string,
    dto: Omit<IIntercambiarDiasDTO, 'aplicarARutaBase'>,
): Promise<number> => {
    const res = await apiClient.post(`${baseRuta(codigo)}/intercambiar-dias`, dto)
    return res.data.data.movidas
}

export const intercambiarSemanasRutaBase = async (
    codigo: string,
    dto: Omit<IIntercambiarSemanasDTO, 'aplicarARutaBase'>,
): Promise<number> => {
    const res = await apiClient.post(`${baseRuta(codigo)}/intercambiar-semanas`, dto)
    return res.data.data.movidas
}

// ── Buscador de cartera de gerencia (spec 2026-09-09) ──────────────────────────
// Espejo de `/planificacion/buscador/*` del vendedor, con dos diferencias: el vendedor
// y la rotación viajan en la URL (no salen del token ni del ciclo abierto), y la celda
// destino es explícita.

/** Busca en toda la cartera del vendedor, con el estado de cada cliente en esta rotación. */
export const buscarEnCarteraAdmin = async (
    codigo: string,
    rotacionId: number,
    texto: string,
): Promise<IResultadoBuscadorGeneral[]> => {
    const res = await apiClient.get(`${base(codigo)}/${rotacionId}/buscador`, {
        params: { q: texto },
    })
    return res.data.data
}

/** ¿El cliente ya tiene fila en esta rotación, y en qué celdas? */
export const consultarClienteAdmin = async (
    codigo: string,
    rotacionId: number,
    codigoCliente: string,
): Promise<IClienteEnRotacion> => {
    const res = await apiClient.get(
        `${base(codigo)}/${rotacionId}/buscador/cliente/${encodeURIComponent(codigoCliente)}`,
    )
    return res.data.data
}

/** Crea la fila `es_extra` en la celda `(semana, dia)`. Idempotente sobre la misma celda. */
export const agregarClienteExtraAdmin = async (
    codigo: string,
    rotacionId: number,
    codigoCliente: string,
    semana: number,
    dia: number,
): Promise<IAgendaClientAdmin> => {
    const res = await apiClient.post(
        `${base(codigo)}/${rotacionId}/buscador/cliente/${encodeURIComponent(codigoCliente)}/extra`,
        { semana, dia },
    )
    return res.data.data
}
