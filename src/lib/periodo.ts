import { diaHabilVecino, nombreDia, nombreMes, nombreSemana, rangoDia, rangoMes, rangoSemana } from '@/lib/fechas'

export type ModoPeriodo = 'dia' | 'semana' | 'mes'

export const MODOS_PERIODO: { valor: ModoPeriodo; etiqueta: string }[] = [
    { valor: 'dia', etiqueta: 'Día' },
    { valor: 'semana', etiqueta: 'Semana' },
    { valor: 'mes', etiqueta: 'Mes' },
]

/** La fecha con la que arranca un modo nuevo: hoy, salvo el Día en un fin de semana, que
 *  arranca en el último día hábil (sábado y domingo no tienen objetivo). Volver a hoy evita
 *  arrastrar, por ejemplo, un 31 a una semana que no existe en un mes corto. */
export function fechaAlCambiarModo(modo: ModoPeriodo, hoy: Date = new Date()): Date {
    const finde = hoy.getDay() === 0 || hoy.getDay() === 6
    return modo === 'dia' && finde ? diaHabilVecino(hoy, -1) : hoy
}

/** El período anterior o siguiente: el mes va al día 1, la semana de a 7 días y el día salta
 *  los fines de semana. */
export function avanzarPeriodo(modo: ModoPeriodo, fecha: Date, delta: 1 | -1): Date {
    if (modo === 'mes') return new Date(fecha.getFullYear(), fecha.getMonth() + delta, 1)
    if (modo === 'dia') return diaHabilVecino(fecha, delta)
    const siguiente = new Date(fecha)
    siguiente.setDate(fecha.getDate() + delta * 7)
    return siguiente
}

/** El rango `desde`/`hasta` (YYYY-MM-DD) de un período: el día, la semana de lunes a viernes o
 *  el mes calendario que contiene `fecha`. */
export function rangoDePeriodo(modo: ModoPeriodo, fecha: Date): { desde: string; hasta: string } {
    return modo === 'mes' ? rangoMes(fecha) : modo === 'dia' ? rangoDia(fecha) : rangoSemana(fecha)
}

const aFechaLocal = (iso: string) => {
    const [a, m, d] = iso.split('-').map(Number)
    return new Date(a, m - 1, d)
}

/** El período de un rango guardado en la URL (Altas): un día, una semana de lunes a viernes o un
 *  mes calendario. Un rango libre de un link viejo se lee como el mes en que empieza. */
export function periodoDeRango(desde: string, hasta: string): { modo: ModoPeriodo; fecha: Date } {
    const fecha = aFechaLocal(desde)
    if (desde === hasta) return { modo: 'dia', fecha }
    const semana = rangoSemana(fecha)
    if (semana.desde === desde && semana.hasta === hasta) return { modo: 'semana', fecha }
    return { modo: 'mes', fecha }
}

/** "Octubre 2026", "12/10 al 16/10" o "Viernes 16/10". */
export function nombrePeriodo(modo: ModoPeriodo, fecha: Date): string {
    return modo === 'mes' ? nombreMes(fecha) : modo === 'dia' ? nombreDia(fecha) : nombreSemana(fecha)
}
