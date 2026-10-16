import { diaHabilVecino, nombreDia, nombreMes, nombreSemana } from '@/lib/fechas'

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

/** "Octubre 2026", "12/10 al 16/10" o "Viernes 16/10". */
export function nombrePeriodo(modo: ModoPeriodo, fecha: Date): string {
    return modo === 'mes' ? nombreMes(fecha) : modo === 'dia' ? nombreDia(fecha) : nombreSemana(fecha)
}
