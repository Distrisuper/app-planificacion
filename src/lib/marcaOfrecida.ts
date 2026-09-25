import type { ICatalogoItem, IMarcaEstado, IMarcaOfrecida } from '@/types/planificacion'

/**
 * La MARCA es el nombre (SKF); el `brand_code` es una LÍNEA suya dentro de un rubro —
 * SKF vende bajo ~14 códigos. "¿Qué marca ofreciste?" pregunta por la marca, y la línea
 * no hace falta preguntarla: la define el rubro que se está resolviendo. Esto elige qué
 * código guardar para `descripcion` en `rubroCode`, en este orden:
 *
 *   1. el del chip del rubro con ese nombre — la línea que el cliente efectivamente
 *      compra ahí (SKF tiene tres líneas en ROD RUEDA; la del chip es la suya);
 *   2. la línea de la marca en ese rubro según el catálogo (`lineaPorRubro`);
 *   3. el código que ya traía (o el general del catálogo): la marca no tiene línea en
 *      ese rubro — DEXCO ofrecida en ROD BOLA —, y se guarda igual, porque lo que el
 *      vendedor declara es que la ofreció.
 */
export function lineaDeMarca(
    marca: { codigo?: string; descripcion: string },
    rubroCode: string | null,
    marcasDelRubro: IMarcaEstado[],
    catalogo: ICatalogoItem[],
): IMarcaOfrecida {
    const { descripcion } = marca
    const chip = marcasDelRubro.find(m => m.nombre === descripcion)
    if (chip) return { codigo: chip.code, descripcion }

    const item = catalogo.find(i => i.description === descripcion)
    const linea = rubroCode ? item?.lineaPorRubro?.[rubroCode] : undefined
    return { codigo: linea ?? marca.codigo ?? item?.code ?? '', descripcion }
}
