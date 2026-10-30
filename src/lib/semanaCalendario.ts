import { errorCode } from './apiError'
import { isoLocal } from './fechas'
import type { Dia, IAgendaClient, ISemanaHorizonte, TipoSemanaCalendario } from '@/types/planificacion'

/**
 * Semana del calendario (desde el 2/11/2026): todos los vendedores van en la misma semana de
 * la ruta, que avanza sola cada lunes. `GET /ciclo/actual` manda `semanaEnCurso`,
 * `fechaLunesEnCurso` y el `horizonte` (la en curso + 4). Sin eso todo sigue como antes.
 * Ver docs/dominio/modelo.md, "El tiempo".
 */

export const MENSAJE_FUERA_DE_CALENDARIO = 'Este cliente es de otra semana: pasalo a esta semana desde "Reagendar".'
export const MENSAJE_AGREGAR_FUERA_DE_CALENDARIO = 'En esta semana no se pueden agregar clientes.'
export const MENSAJE_MOVER_FUERA_DE_CALENDARIO = 'Ese cliente no se puede mover a esa semana.'
/** Para una visita ya abierta (quedó del viernes, se mira el lunes): no se puede mover
 *  —tiene resolución—, pero cerrarla no tiene guard en el back. */
export const MENSAJE_VISITA_FUERA_DE_CALENDARIO = 'Esta visita es de otra semana: solo se puede cerrar.'

/**
 * El texto del 409 `SEMANA_FUERA_DE_CALENDARIO` (el back rechaza una acción del vendedor
 * fuera de lo que permite el calendario), o null si el error es otro. Va primero en cada
 * `catch`: sin esto el vendedor leía un "Volvé a intentar" que no iba a andar nunca.
 */
export function mensajeFueraDeCalendario(
    err: unknown,
    mensaje: string = MENSAJE_FUERA_DE_CALENDARIO,
): string | null {
    return errorCode(err) === 'SEMANA_FUERA_DE_CALENDARIO' ? mensaje : null
}

/** 'YYYY-MM-DD' como fecha LOCAL: `new Date('2026-11-09')` es UTC y en Buenos Aires cae el
 *  domingo 8. */
export function lunesLocal(fechaLunes: string): Date {
    const [anio, mes, dia] = fechaLunes.split('-').map(Number)
    return new Date(anio, mes - 1, dia)
}

function sumarSemanas(fechaLunes: string, semanas: number): string {
    const fecha = lunesLocal(fechaLunes)
    fecha.setDate(fecha.getDate() + 7 * semanas)
    return isoLocal(fecha)
}

/**
 * Las semanas por las que navega el vendedor, de la más vieja a la última del horizonte: las
 * que ya pasaron en esta vuelta (la semana 1 es `fechaLunesEnCurso − 7·(semanaEnCurso − 1)`)
 * y el horizonte. Antes de la vuelta actual no se mira: el contrato no lo pide.
 */
export function semanasNavegables(
    fechaLunesEnCurso: string,
    semanaEnCurso: number,
    horizonte: ISemanaHorizonte[],
): string[] {
    const pasadas: string[] = []
    for (let k = semanaEnCurso - 1; k >= 1; k--) pasadas.push(sumarSemanas(fechaLunesEnCurso, -k))
    const delHorizonte = horizonte.map(h => h.fechaLunes).filter(f => f >= fechaLunesEnCurso)
    return [...pasadas, ...delHorizonte.sort()]
}

/** 'YYYY-MM-DD' se ordena igual como texto que como fecha. */
export function tipoDeSemana(fechaLunes: string, fechaLunesEnCurso: string): TipoSemanaCalendario {
    if (fechaLunes === fechaLunesEnCurso) return 'actual'
    return fechaLunes < fechaLunesEnCurso ? 'pasada' : 'futura'
}

/** La fila de `cliente` en la semana recién armada: armar le da ids nuevos, así que se
 *  busca por cliente y día (y, si se movió de día, por cliente en cualquier día). */
export function filaArmada(
    semana: { dias: Record<Dia, IAgendaClient[]> },
    cliente: Pick<IAgendaClient, 'codigoParticularCliente' | 'dia'>,
): IAgendaClient | undefined {
    const mismoCliente = (f: IAgendaClient) => f.codigoParticularCliente === cliente.codigoParticularCliente
    return (
        semana.dias[DIAS[cliente.dia - 1]]?.find(mismoCliente) ??
        DIAS.flatMap(d => semana.dias[d] ?? []).find(mismoCliente)
    )
}

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']

/** "Zárate · 9/11", o "Semana 2 · 9/11" si la zona no tiene nombre. */
export function etiquetaSemana(s: { fechaLunes: string; semana: number; descripcion: string | null }): string {
    const lunes = lunesLocal(s.fechaLunes)
    return `${s.descripcion || `Semana ${s.semana}`} · ${lunes.getDate()}/${lunes.getMonth() + 1}`
}
