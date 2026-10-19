import type { Dia, ISemanaRotacionAdmin, ISemanaRutaBase } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

/**
 * La ruta base con la forma del grid de la vuelta, para editarla con el mismo
 * `GridRotacion`. El id de la card es el de la fila de la ruta base: es lo que viaja al
 * mover o quitar. Todo queda pendiente y sin extras ni quitados, porque en la ruta base no
 * hay hechos: es solo plan.
 */
export function rutaBaseComoGrid(semanas: ISemanaRutaBase[]): ISemanaRotacionAdmin[] {
    return semanas.map(s => ({
        semana: s.semana,
        descripcion: s.descripcion,
        estado: 'pendiente',
        dias: Object.fromEntries(
            DIAS.map((d, i) => [
                d,
                s.dias[d].map(c => ({
                    rotacionClienteId: c.id,
                    codigoParticularCliente: c.codigoParticularCliente,
                    nombreCliente: c.nombreCliente,
                    dia: i + 1,
                    estado: 'pendiente' as const,
                    esExtra: false,
                    eliminado: false,
                    ultimoMovimiento: null,
                })),
            ]),
        ) as ISemanaRotacionAdmin['dias'],
    }))
}
