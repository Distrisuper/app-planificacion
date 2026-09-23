import type { IFichaRelevadaFila } from '@/types/analitica'

/** Mayúsculas y acentos fuera: el warehouse trae 'MARTINEZ' y gerencia tipea 'martínez'. */
const normalizar = (t: string) =>
    t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/**
 * El buscador de "Datos del comercio": filtra por código o nombre de CLIENTE, en memoria.
 * El listado ya viene entero (es un padrón de cientos de filas), así que no hace falta ir al
 * backend. El `#` se ignora porque así se ve el código en la tabla.
 */
export function buscarFichas(fichas: IFichaRelevadaFila[], texto: string): IFichaRelevadaFila[] {
    const q = normalizar(texto).replace(/^#/, '')
    if (!q) return fichas
    return fichas.filter(
        f =>
            normalizar(f.codigoParticularCliente).includes(q) ||
            normalizar(f.nombreCliente).includes(q),
    )
}
