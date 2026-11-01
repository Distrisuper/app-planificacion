import { errorCode } from './apiError'
import { isoLocal, nombreMes } from './fechas'
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
/** "Volver más tarde" sobre una visita que quedó abierta de una semana que ya pasó (del
 *  viernes, se mira el sábado): no puede volver a quedar pendiente, pero cerrarla o
 *  registrar "No visité" sí se puede. */
export const MENSAJE_VISITA_FUERA_DE_CALENDARIO =
    'Esta visita es de una semana que ya pasó: cerrala o registrá "No visité".'

/** Los otros errores del calendario: no dependen de qué estaba haciendo el vendedor. */
const MENSAJES_CALENDARIO: Record<string, string> = {
    SEMANA_SIN_AGENDA: 'Esa semana todavía no tiene agenda. Avisá a tu supervisor.',
    FECHA_LUNES_INVALIDA: 'No pudimos ubicar esa semana. Recargá la app y volvé a intentar.',
    // Corte de vuelta postergado: hasta cerrar esa visita no se abre la semana nueva.
    VISITA_EN_CURSO: 'Tenés una visita abierta de la semana pasada: cerrala antes de seguir.',
}

/**
 * El texto de un error del calendario, o null si el error es otro. El 409
 * `SEMANA_FUERA_DE_CALENDARIO` (una acción fuera de lo que permite la semana) usa `mensaje`,
 * que depende de qué se estaba haciendo. Va primero en cada `catch`: sin esto el vendedor
 * leía un "Volvé a intentar" que no iba a andar nunca.
 */
export function mensajeErrorCalendario(
    err: unknown,
    mensaje: string = MENSAJE_FUERA_DE_CALENDARIO,
): string | null {
    const code = errorCode(err)
    if (code === 'SEMANA_FUERA_DE_CALENDARIO') return mensaje
    return (code && MENSAJES_CALENDARIO[code]) || null
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

/** El lunes en que arranca el calendario: la semana 1 de todos. Antes no hay semanas de
 *  calendario que mirar (lo anterior es la vuelta del modelo viejo). */
export const ANCLA_CALENDARIO = '2026-11-02'

/**
 * Las semanas por las que navega el vendedor, de la más vieja a la última del horizonte:
 * todas las que ya pasaron desde el 2/11 (de cualquier vuelta, solo para mirar) y el
 * horizonte. Son ~52 por año: alcanza con una lista.
 */
export function semanasNavegables(fechaLunesEnCurso: string, horizonte: ISemanaHorizonte[]): string[] {
    const pasadas: string[] = []
    for (let f = ANCLA_CALENDARIO; f < fechaLunesEnCurso; f = sumarSemanas(f, 1)) pasadas.push(f)
    const delHorizonte = horizonte.map(h => h.fechaLunes).filter(f => f >= fechaLunesEnCurso)
    return [...pasadas, ...delHorizonte.sort()]
}

/** Las semanas agrupadas por el mes de su lunes, del mes más nuevo al más viejo (lo
 *  reciente arriba); dentro del mes, en orden de calendario. Es la lista de "Elegir semana". */
export function semanasPorMes(fechas: string[]): { mes: string; fechas: string[] }[] {
    const grupos: { mes: string; fechas: string[] }[] = []
    for (const f of [...fechas].sort()) {
        const mes = nombreMes(lunesLocal(f))
        const ultimo = grupos[grupos.length - 1]
        if (ultimo?.mes === mes) ultimo.fechas.push(f)
        else grupos.push({ mes, fechas: [f] })
    }
    return grupos.reverse()
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

/** "9/11" */
export function fechaCorta(fechaLunes: string): string {
    const lunes = lunesLocal(fechaLunes)
    return `${lunes.getDate()}/${lunes.getMonth() + 1}`
}

/** "Zárate · 9/11", o "Semana 2 · 9/11" si la zona no tiene nombre. */
export function etiquetaSemana(s: { fechaLunes: string; semana: number; descripcion: string | null }): string {
    return `${s.descripcion || `Semana ${s.semana}`} · ${fechaCorta(s.fechaLunes)}`
}
