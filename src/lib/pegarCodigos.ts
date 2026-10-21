/**
 * Lo que gerencia pega en "Pegar códigos" de una semana de la ruta base.
 *
 * - `grilla`: lo copiado de Excel, con las columnas separadas por tab. La columna 1 es el LUN
 *   y la 5 el VIE; cada renglón es una fila de la grilla. Vienen los días que entraron en lo
 *   copiado, aunque alguno quede sin códigos: Excel copia las celdas vacías del rango como
 *   tabs, así que una columna vacía es un día que se quiere vacío.
 * - `columna`: un código por renglón, para el día que se elija aparte.
 */
export type CodigosPegados =
    | { modo: 'grilla'; dias: Partial<Record<number, string[]>> }
    | { modo: 'columna'; codigos: string[] }
    | { modo: 'vacio' }

const MAX_DIAS = 5

/** "LUN", "Martes", "MIÉ"…: el renglón de encabezado que viene si se copió con títulos. */
const NOMBRE_DIA = /^(lun|mar|mi[eé]|jue|vie)[a-zé]*\.?$/i

function esEncabezado(celdas: string[]): boolean {
    const llenas = celdas.filter(c => c !== '')
    return llenas.length > 0 && llenas.every(c => NOMBRE_DIA.test(c))
}

export function parsearCodigosPegados(texto: string): CodigosPegados {
    const filas = texto
        .split('\n')
        .map(renglon => renglon.replace(/\r$/, '').split('\t').map(c => c.trim()))
        .filter(celdas => celdas.some(c => c !== ''))
    if (filas.length > 0 && esEncabezado(filas[0])) filas.shift()
    if (filas.length === 0) return { modo: 'vacio' }

    const columnas = Math.min(MAX_DIAS, Math.max(...filas.map(f => f.length)))
    if (columnas === 1) {
        return { modo: 'columna', codigos: filas.map(f => f[0]) }
    }

    const dias: Partial<Record<number, string[]>> = {}
    for (let dia = 1; dia <= columnas; dia++) {
        dias[dia] = filas.map(f => f[dia - 1] ?? '').filter(c => c !== '')
    }
    return { modo: 'grilla', dias }
}

/** Los días con sus códigos, con la clave ("1".."5") que espera `sincronizar`. */
export function diasDeLoPegado(
    pegado: Exclude<CodigosPegados, { modo: 'vacio' }>,
    diaElegido: number,
): Record<string, string[]> {
    if (pegado.modo === 'columna') return { [String(diaElegido)]: pegado.codigos }
    return Object.fromEntries(
        Object.entries(pegado.dias).map(([dia, codigos]) => [dia, codigos ?? []]),
    )
}
