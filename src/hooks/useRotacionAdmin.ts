import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    agregarARutaBase,
    agregarClienteExtraAdmin,
    agregarSemanaRutaBase,
    buscarEnCarteraAdmin,
    buscarEnRutaBase,
    cancelarRotacion,
    consultarClienteAdmin,
    crearRotacion,
    editarDescripcionRotacion,
    editarDescripcionSemana,
    getRotacion,
    getRotaciones,
    getRutaBase,
    intercambiarDias,
    intercambiarDiasRutaBase,
    intercambiarSemanas,
    intercambiarSemanasRutaBase,
    moverEnRutaBase,
    moverSemanaRutaBase,
    quitarClienteAdmin,
    quitarDeRutaBase,
    reacomodarAdmin,
    reordenarRotacion,
    reiniciarRotacion,
    restaurarClienteAdmin,
    restaurarEnRutaBase,
    sincronizarRutaBase,
} from '@/api/planificacionAdmin'
import { moverEnGrid, moverEnRutaBase as moverEnCacheRutaBase } from '@/lib/moverEnGrid'
import type {
    IIntercambiarDiasDTO,
    IIntercambiarSemanasDTO,
    IReacomodarDTO,
    IRotacionCompleta,
    IRutaBase,
} from '@/types/planificacion'
import { useTextoDebounced } from './useTextoDebounced'

export const rotacionAdminKeys = {
    /** Toda la data de gerencia de un vendedor, para invalidar de una. */
    vendedor: (codigo: string) => ['rotacionAdmin', codigo] as const,
    cola: (codigo: string) => ['rotacionAdmin', codigo, 'cola'] as const,
    grid: (codigo: string, rotacionId: number) =>
        ['rotacionAdmin', codigo, 'grid', rotacionId] as const,
    rutaBase: (codigo: string) => ['rotacionAdmin', codigo, 'rutaBase'] as const,
}

/** `codigo` null = todavía no se eligió vendedor: no se consulta nada. */
export function useRotaciones(codigo: string | null) {
    return useQuery({
        queryKey: rotacionAdminKeys.cola(codigo ?? ''),
        queryFn: () => getRotaciones(codigo as string),
        enabled: codigo !== null,
    })
}

export function useRotacion(codigo: string | null, rotacionId: number | null) {
    return useQuery({
        queryKey: rotacionAdminKeys.grid(codigo ?? '', rotacionId ?? 0),
        queryFn: () => getRotacion(codigo as string, rotacionId as number),
        enabled: codigo !== null && rotacionId !== null,
    })
}

/** La ruta base. `codigo` null = no se consulta (sin vendedor, o con la vista de la vuelta). */
export function useRutaBase(codigo: string | null) {
    return useQuery({
        queryKey: rotacionAdminKeys.rutaBase(codigo ?? ''),
        queryFn: () => getRutaBase(codigo as string),
        enabled: codigo !== null,
    })
}

/** Encola una programada nueva. Invalida la cola: hay un chip más. */
export function useCrearRotacion(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () => crearRotacion(codigo),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: rotacionAdminKeys.cola(codigo) })
        },
    })
}

/**
 * Reinicia la vuelta: cierra la actual y arranca otra. Cambia todo lo del vendedor (la cola,
 * el grid de la que se cerró y el de la nueva), así que se invalida entero.
 */
export function useReiniciarRotacion(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () => reiniciarRotacion(codigo),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: rotacionAdminKeys.vendedor(codigo) })
        },
    })
}

/**
 * Mover una card. Invalida solo el grid de ESA rotación: la cola no cambió y los grids de
 * las otras rotaciones tampoco — un reacomodo nunca cruza rotaciones.
 */
export function useReacomodarAdmin(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (
            args: { rotacionId: number; rotacionClienteId: number } & IReacomodarDTO,
        ) =>
            reacomodarAdmin(codigo, args.rotacionId, args.rotacionClienteId, {
                semana: args.semana,
                dia: args.dia,
                aplicarARutaBase: args.aplicarARutaBase,
            }),
        /**
         * Update optimista: la card se mueve en la caché antes de que el backend conteste,
         * así el arrastre se siente instantáneo. Sin esto había que esperar el PATCH más la
         * relectura del grid entero para ver la card en su lugar nuevo.
         */
        onMutate: async args => {
            const key = rotacionAdminKeys.grid(codigo, args.rotacionId)
            // Cancelar lo que esté en vuelo: si una relectura anterior llega después de
            // escribir la caché, la pisa con el estado viejo y la card "vuelve" sola.
            await qc.cancelQueries({ queryKey: key })

            const previo = qc.getQueryData<IRotacionCompleta>(key)
            if (previo) {
                qc.setQueryData(
                    key,
                    moverEnGrid(previo, args.rotacionClienteId, args.semana, args.dia),
                )
            }
            return { previo, key }
        },
        onError: (_err, _args, context) => {
            // Rollback. Importa de verdad: el backend rechaza mover un cliente ya resuelto
            // (409 FILA_RESUELTA) y una semana fuera del set (422), y sin esto la card
            // quedaba visualmente en un lugar donde no está.
            if (context?.previo) qc.setQueryData(context.key, context.previo)
        },
        onSettled: (_data, _err, args) => {
            // Reconciliar igual, en éxito y en error: la autoría (`ultimoMovimiento`: quién
            // movió y cuándo) la calcula el backend y no se puede adivinar acá. Con la card
            // recortada el grid pesa ~30 KB, así que este refetch es barato — antes eran
            // 1.46 MB por movimiento.
            qc.invalidateQueries({
                queryKey: rotacionAdminKeys.grid(codigo, args.rotacionId),
            })
            if (args.aplicarARutaBase) {
                qc.invalidateQueries({ queryKey: rotacionAdminKeys.rutaBase(codigo) })
            }
        },
    })
}

/**
 * Quitar una card de la rotación. Sin update optimista, a propósito: es una acción
 * destructiva (aunque reversible solo por la próxima rotación) y el caso de bloqueo
 * (409 FILA_RESUELTA / VISITA_EN_CURSO) es esperado, no un borde — mismo criterio que
 * `useIntercambiarDias`.
 */
export function useQuitarClienteAdmin(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { rotacionId: number; rotacionClienteId: number }) =>
            quitarClienteAdmin(codigo, args.rotacionId, args.rotacionClienteId),
        onSuccess: (_data, args) => {
            qc.invalidateQueries({
                queryKey: rotacionAdminKeys.grid(codigo, args.rotacionId),
            })
        },
    })
}

/** Deshace un "quitar". Mismo patrón que useQuitarClienteAdmin: sin optimistic update,
 *  el bloqueo (404 FILA_NO_ELIMINADA si alguien más ya la restauró) es un caso esperado. */
export function useRestaurarClienteAdmin(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { rotacionId: number; rotacionClienteId: number }) =>
            restaurarClienteAdmin(codigo, args.rotacionId, args.rotacionClienteId),
        onSuccess: (_data, args) => {
            qc.invalidateQueries({
                queryKey: rotacionAdminKeys.grid(codigo, args.rotacionId),
            })
        },
    })
}

export function useReordenarRotacion(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { rotacionId: number; orden: number }) =>
            reordenarRotacion(codigo, args.rotacionId, args.orden),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: rotacionAdminKeys.cola(codigo) })
        },
    })
}

export function useCancelarRotacion(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (rotacionId: number) => cancelarRotacion(codigo, rotacionId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: rotacionAdminKeys.cola(codigo) })
        },
    })
}

/** El nombre de la rotación se ve en el chip (cola) y en el grid: invalida los dos. */
export function useEditarDescripcionRotacion(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { rotacionId: number; descripcion: string | null }) =>
            editarDescripcionRotacion(codigo, args.rotacionId, args.descripcion),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: rotacionAdminKeys.vendedor(codigo) })
        },
    })
}

export function useEditarDescripcionSemana(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: {
            rotacionId: number
            semana: number
            descripcion: string | null
        }) => editarDescripcionSemana(codigo, args.rotacionId, args.semana, args.descripcion),
        onSuccess: (_data, args) => {
            qc.invalidateQueries({
                queryKey: rotacionAdminKeys.grid(codigo, args.rotacionId),
            })
        },
    })
}

/**
 * Sin update optimista, a diferencia del arrastre de una card: acá se mueven hasta ~20
 * filas de golpe y el rechazo por clientes resueltos es un caso esperado, no un borde. Con
 * el grid recortado a ~31 KB, esperar la confirmación y releer es más simple y no se nota.
 */
export function useIntercambiarDias(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { rotacionId: number } & IIntercambiarDiasDTO) =>
            intercambiarDias(codigo, args.rotacionId, {
                semanaA: args.semanaA,
                diaA: args.diaA,
                semanaB: args.semanaB,
                diaB: args.diaB,
                aplicarARutaBase: args.aplicarARutaBase,
            }),
        onSuccess: (_data, args) => {
            qc.invalidateQueries({
                queryKey: rotacionAdminKeys.grid(codigo, args.rotacionId),
            })
            if (args.aplicarARutaBase) {
                qc.invalidateQueries({ queryKey: rotacionAdminKeys.rutaBase(codigo) })
            }
        },
    })
}

/** Permutar dos semanas enteras. Sin update optimista, mismo criterio que `useIntercambiarDias`. */
export function useIntercambiarSemanas(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { rotacionId: number } & IIntercambiarSemanasDTO) =>
            intercambiarSemanas(codigo, args.rotacionId, {
                semanaA: args.semanaA,
                semanaB: args.semanaB,
                aplicarARutaBase: args.aplicarARutaBase,
            }),
        onSuccess: (_data, args) => {
            qc.invalidateQueries({
                queryKey: rotacionAdminKeys.grid(codigo, args.rotacionId),
            })
            if (args.aplicarARutaBase) {
                qc.invalidateQueries({ queryKey: rotacionAdminKeys.rutaBase(codigo) })
            }
        },
    })
}

// ── Edición de la ruta base ──────────────────────────────────────────────────────
// Todas releen la ruta base y nada más: la vuelta en curso no cambia por editar la base.

/**
 * Mover una card de la ruta base, también dentro del mismo día (`posicion`). Optimista con
 * rollback, igual que `useReacomodarAdmin`.
 */
export function useMoverEnRutaBase(codigo: string) {
    const qc = useQueryClient()
    const key = rotacionAdminKeys.rutaBase(codigo)
    return useMutation({
        mutationFn: (args: { id: number; semana: number; dia: number; posicion?: number }) =>
            moverEnRutaBase(codigo, args.id, {
                semana: args.semana,
                dia: args.dia,
                // Sin la clave cuando no hay posición: el back la manda al final.
                ...(args.posicion !== undefined && { posicion: args.posicion }),
            }),
        onMutate: async args => {
            await qc.cancelQueries({ queryKey: key })
            const previo = qc.getQueryData<IRutaBase>(key)
            if (previo) {
                qc.setQueryData(
                    key,
                    moverEnCacheRutaBase(previo, args.id, args.semana, args.dia, args.posicion),
                )
            }
            return { previo }
        },
        onError: (_err, _args, context) => {
            if (context?.previo) qc.setQueryData(key, context.previo)
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: key })
        },
    })
}

/** Borrado lógico: la card queda quitada, con Restaurar. Sin optimista, como `useQuitarClienteAdmin`. */
export function useQuitarDeRutaBase(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: number) => quitarDeRutaBase(codigo, id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: rotacionAdminKeys.rutaBase(codigo) })
        },
    })
}

/** Deshace un "quitar". El 409 (el cliente ya volvió a esa celda) es esperado: sin optimista. */
export function useRestaurarEnRutaBase(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: number) => restaurarEnRutaBase(codigo, id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: rotacionAdminKeys.rutaBase(codigo) })
        },
    })
}

export function useAgregarSemanaRutaBase(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () => agregarSemanaRutaBase(codigo),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: rotacionAdminKeys.rutaBase(codigo) })
        },
    })
}

/** Renumera todas las semanas: se relee la ruta entera, sin optimista. */
export function useMoverSemanaRutaBase(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { semana: number; posicion: number }) => moverSemanaRutaBase(codigo, args),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: rotacionAdminKeys.rutaBase(codigo) })
        },
    })
}

/**
 * "Pegar códigos": con `aplicar: false` es la vista previa y no cambia nada, así que solo
 * se relee la ruta cuando se aplicó.
 */
export function useSincronizarRutaBase(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { semana: number; dias: Record<string, string[]>; aplicar: boolean }) =>
            sincronizarRutaBase(codigo, args),
        onSuccess: (_data, args) => {
            if (args.aplicar) {
                qc.invalidateQueries({ queryKey: rotacionAdminKeys.rutaBase(codigo) })
            }
        },
    })
}

export function useAgregarARutaBase(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: { codigoCliente: string; semana: number; dia: number }) =>
            agregarARutaBase(codigo, args),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: rotacionAdminKeys.rutaBase(codigo) })
        },
    })
}

export function useIntercambiarDiasRutaBase(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: Omit<IIntercambiarDiasDTO, 'aplicarARutaBase'>) =>
            intercambiarDiasRutaBase(codigo, {
                semanaA: args.semanaA,
                diaA: args.diaA,
                semanaB: args.semanaB,
                diaB: args.diaB,
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: rotacionAdminKeys.rutaBase(codigo) })
        },
    })
}

export function useIntercambiarSemanasRutaBase(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: Omit<IIntercambiarSemanasDTO, 'aplicarARutaBase'>) =>
            intercambiarSemanasRutaBase(codigo, { semanaA: args.semanaA, semanaB: args.semanaB }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: rotacionAdminKeys.rutaBase(codigo) })
        },
    })
}

// ── Buscador de cartera de gerencia (spec 2026-09-09) ──────────────────────────

/** Mismo mínimo que el backend, que devuelve `[]` por debajo de 2 caracteres. */
const MIN_CARACTERES = 2

/**
 * Busca en la cartera del vendedor, dentro de una rotación concreta.
 *
 * Mismo patrón que `useBuscarEnCartera` (el del vendedor): debounce y mínimo de 2
 * caracteres, porque el endpoint resuelve el estado cliente por cliente.
 */
export function useBuscarEnCarteraAdmin(
    codigo: string,
    rotacionId: number,
    texto: string,
) {
    const debounced = useTextoDebounced(texto)
    const listo = debounced.trim().length >= MIN_CARACTERES

    const query = useQuery({
        queryKey: [...rotacionAdminKeys.vendedor(codigo), 'buscador', rotacionId, debounced],
        queryFn: () => buscarEnCarteraAdmin(codigo, rotacionId, debounced),
        enabled: listo,
    })

    return {
        ...query,
        // Mientras el debounce no alcanzó al input, lo que hay en pantalla son los
        // resultados del texto ANTERIOR: sin esto, tipear una letra más deja ver 300ms
        // una lista que ya no corresponde, y el "Sin resultados" aparece antes de haber
        // buscado.
        buscando: query.isFetching || (listo && debounced !== texto),
    }
}

/**
 * Busca en la cartera del vendedor para sumar a la ruta base. Cada resultado trae las
 * celdas de la ruta base donde ya está. Mismo debounce y mínimo que `useBuscarEnCarteraAdmin`.
 */
export function useBuscarEnRutaBase(codigo: string, texto: string) {
    const debounced = useTextoDebounced(texto)
    const listo = debounced.trim().length >= MIN_CARACTERES

    const query = useQuery({
        queryKey: [...rotacionAdminKeys.rutaBase(codigo), 'buscador', debounced],
        queryFn: () => buscarEnRutaBase(codigo, debounced),
        enabled: listo,
    })

    return { ...query, buscando: query.isFetching || (listo && debounced !== texto) }
}

/** Solo lectura: no invalida nada. Es la consulta previa a confirmar. */
export function useConsultarClienteAdmin(codigo: string) {
    return useMutation({
        mutationFn: (args: { rotacionId: number; codigoCliente: string }) =>
            consultarClienteAdmin(codigo, args.rotacionId, args.codigoCliente),
    })
}

/**
 * Crea la fila extra. Sin update optimista, igual que `useQuitarClienteAdmin`: la fila
 * nueva la arma el backend (nombre del cliente, estado) y no se puede adivinar acá.
 */
export function useAgregarClienteExtraAdmin(codigo: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (args: {
            rotacionId: number
            codigoCliente: string
            semana: number
            dia: number
        }) =>
            agregarClienteExtraAdmin(
                codigo,
                args.rotacionId,
                args.codigoCliente,
                args.semana,
                args.dia,
            ),
        onSuccess: (_data, args) => {
            qc.invalidateQueries({
                queryKey: rotacionAdminKeys.grid(codigo, args.rotacionId),
            })
        },
    })
}
