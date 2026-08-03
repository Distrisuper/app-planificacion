import type { Dia } from '@/types/planificacion'

const DIAS: Dia[] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function mondayOfWeek(reference: Date) {
    const date = new Date(reference)
    const day = date.getDay() // 0=Sun..6=Sat
    const diff = day === 0 ? -6 : 1 - day
    date.setDate(date.getDate() + diff)
    date.setHours(0, 0, 0, 0)
    return date
}

export function getWeekDates(reference: Date = new Date()): Record<Dia, Date> {
    const monday = mondayOfWeek(reference)
    const out = {} as Record<Dia, Date>
    DIAS.forEach((d, i) => {
        const date = new Date(monday)
        date.setDate(monday.getDate() + i)
        out[d] = date
    })
    return out
}

/** El `Dia` de hoy, o null si es sábado o domingo (la agenda es lunes a viernes).
 *  Sirve para que la agenda arranque en el día que el vendedor está recorriendo en vez
 *  de en LUN, que un jueves lo obliga a swipear cuatro columnas. */
export function getDiaDeHoy(reference: Date = new Date()): Dia | null {
    const dates = getWeekDates(reference)
    return DIAS.find(d => isSameDay(dates[d], reference)) ?? null
}

export function formatDayDate(date: Date): string {
    return `${date.getDate()} ${MESES[date.getMonth()]}`
}

export function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function getWeekRangeLabel(reference: Date = new Date()): string {
    const dates = getWeekDates(reference)
    const first = dates.LUN
    const last = dates.VIE
    if (first.getMonth() === last.getMonth()) {
        return `${first.getDate()} – ${last.getDate()} ${MESES[first.getMonth()]}`
    }
    return `${formatDayDate(first)} – ${formatDayDate(last)}`
}
