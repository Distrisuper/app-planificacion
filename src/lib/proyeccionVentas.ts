/**
 * Proyección del mes en curso para Facturación (PROY), con la MISMA regla que Versus
 * (app-vendedores: src/config/businessDays.ts y src/utils/extrapolateMonthValue.ts), para que
 * las dos pantallas den el mismo número: valor × días hábiles del mes / días hábiles
 * transcurridos, con Lun–Vie = 1, sábado = 0,5, sin domingos ni feriados, y el día de hoy
 * contando recién desde las 13:00 de Argentina. Copiado y no importado: son repos distintos.
 * Si cambia allá (un año nuevo de feriados, otra hora de corte), se cambia acá.
 */

interface ConfigAnio {
    /** Feriados nacionales "MM-DD" que caen Lun–Sáb. */
    feriados: string[]
    /** Días hábiles totales por mes (1 = enero). */
    diasHabilesPorMes: Record<number, number>
}

const CONFIG: Record<number, ConfigAnio> = {
    2026: {
        feriados: [
            '01-01', '02-16', '02-17', '03-24', '04-02', '04-03', '05-01', '05-25',
            '06-15', '06-20', '07-09', '08-17', '10-12', '11-20', '12-08', '12-25',
        ],
        diasHabilesPorMes: {
            1: 23.5, 2: 20, 3: 23, 4: 22, 5: 21.5, 6: 22,
            7: 24, 8: 22.5, 9: 24, 10: 24, 11: 22, 12: 21.5,
        },
    },
}

/** Desde esta hora (Argentina) el día de hoy cuenta como transcurrido. */
const HORA_DE_CORTE = 13

interface Dia {
    anio: number
    mes: number
    dia: number
}

function ahoraEnArgentina(ahora: Date): Dia & { hora: number } {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hour12: false,
    }).formatToParts(ahora)
    const parte = (tipo: string) => parseInt(partes.find(p => p.type === tipo)?.value ?? '', 10)
    // "en-CA" puede dar "24" a la medianoche.
    return { anio: parte('year'), mes: parte('month'), dia: parte('day'), hora: parte('hour') % 24 }
}

/** El último día que cuenta: ayer hasta las 13:00, hoy desde las 13:00 (en Argentina). */
function diaDeCorte(ahora: Date): Dia {
    const a = ahoraEnArgentina(ahora)
    if (a.hora >= HORA_DE_CORTE) return a
    const d = new Date(Date.UTC(a.anio, a.mes - 1, a.dia))
    d.setUTCDate(d.getUTCDate() - 1)
    return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() }
}

/** Días hábiles del 1 hasta `hastaDia` inclusive. */
function contarTranscurridos(anio: number, mes: number, hastaDia: number): number {
    const feriados = new Set(CONFIG[anio]?.feriados ?? [])
    let cuenta = 0
    for (let dia = 1; dia <= hastaDia; dia++) {
        const diaSemana = new Date(anio, mes - 1, dia).getDay()
        if (diaSemana === 0) continue
        if (feriados.has(`${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`)) continue
        cuenta += diaSemana === 6 ? 0.5 : 1
    }
    return cuenta
}

/** Días hábiles transcurridos y totales del mes en curso. Sin config del año, usa días
 *  calendario (el mismo respaldo que Versus). */
export function avanceDelMes(ahora: Date = new Date()): { transcurridos: number; totales: number } {
    const { anio, mes, dia } = diaDeCorte(ahora)
    const totales = CONFIG[anio]?.diasHabilesPorMes[mes]
    if (totales === undefined) {
        return { transcurridos: Math.max(dia, 1), totales: new Date(anio, mes, 0).getDate() }
    }
    return { transcurridos: contarTranscurridos(anio, mes, dia) || 1, totales }
}

/** El valor del mes en curso llevado al mes completo. */
export function proyectarMes(valor: number, ahora: Date = new Date()): number {
    const { transcurridos, totales } = avanceDelMes(ahora)
    if (transcurridos <= 0 || valor === 0) return valor
    return valor * (totales / transcurridos)
}
