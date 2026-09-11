/** Orden 80/20 de rubros: catálogo fijo por peso de venta, de mayor a menor.
 *  Copiado de `ORDER_RUBROS` en api-vendedores (src/business/orderRubros.ts) y de
 *  su equivalente en app-vendedores (src/utils/orderRubros.tsx) — ninguno de los
 *  endpoints que consume esta app aplica este orden server-side, así que se
 *  replica acá para usarlo solo en la sección "otros rubros del cliente" (ver
 *  `filas.ts`): la propuesta y la visita ya tienen su propio orden intencional
 *  (caída/pesos perdidos, o "no reordenar al resolver") y no se tocan. */

export interface IOrderRubro {
    code: string
    name: string
}

export const ORDER_RUBROS: IOrderRubro[] = [
    { code: 'TOTALES', name: 'TOTALES' },
    { code: '322', name: 'AMORTIGUADORES' },
    { code: '363', name: 'KIT DISTRIBUCION' },
    { code: '367', name: 'ROD RUEDA' },
    { code: '323', name: 'ROT, EXT, BARRAS, ACOPLES, BRAZOS DIRECCION' },
    { code: '335', name: 'PARRILLAS, BRAZOS, EJES PARR.' },
    { code: '329', name: 'BUJES' },
    { code: '362', name: 'CAZOLETAS, CRAPODINAS, CUBRE CAZOLETA' },
    { code: '337', name: 'DISCOS, CAMP, MAZAS' },
    { code: '338', name: 'PASTILLAS FRENO' },
    { code: '372', name: 'EMBRAGUE' },
    { code: '352', name: 'BATERIAS' },
    { code: '339', name: 'LIQUIDOS FRENO' },
    { code: '373', name: 'ROD BOLA' },
    { code: '380', name: 'ROD AGRO' },
    { code: '381', name: 'CADENAS' },
    { code: '384', name: 'FILTRO' },
    { code: '331', name: 'BIELETAS' },
    { code: '326', name: 'RESORTES' },
    { code: '344', name: 'JUNTAS HOMOC.' },
    { code: '325', name: 'SALIDAS CREM.' },
    { code: '349', name: 'SOPORTES' },
    { code: '327', name: 'FUELLES, TOPES' },
    { code: '345', name: 'CRUCETAS, TRICETAS' },
    { code: '369', name: 'BOMBA AGUA' },
    { code: '370', name: 'CORREA' },
    { code: '324', name: 'CAJAS DIR' },
    { code: '368', name: 'CRAPODINAS, ACTUADORES Y VARIOS' },
    { code: '371', name: 'TENSOR' },
    { code: '366', name: 'BUJIAS' },
    { code: '357', name: 'REFRIGERANTES' },
    { code: '375', name: 'BOBINA' },
    { code: '340', name: 'DEPRESORES' },
    { code: '343', name: 'SEMIEJES' },
    { code: '382', name: 'KIT DISTRISUPER' },
    { code: '383', name: 'KIT PASTILLA Y DISCO' },
    { code: '364', name: 'ABRAZADERAS' },
    { code: '361', name: 'ANTIPINCHADURAS, COMPRESORES, MEDIDORES' },
    { code: '328', name: 'BARRAS TORSION Y ESTAB' },
    { code: '376', name: 'CABLES' },
    { code: '333', name: 'COLUMNAS DIRECC.' },
    { code: '334', name: 'DESPIECE SUSP. Y DIRECC.' },
    { code: '341', name: 'FLEXIBLES' },
    { code: '356', name: 'LUBRICANTES' },
    { code: '332', name: 'MANCHONES DIRECC.' },
    { code: '330', name: 'PERNOS PUNTA EJE' },
    { code: '358', name: 'PROD. QUIMICOS' },
    { code: '342', name: 'REPUESTOS FRENO' },
    { code: '351', name: 'RESORTES NEUMATICOS' },
    { code: '374', name: 'TERMOSTATO' },
    { code: '353', name: 'BUJIAS PRECALENT.' },
    { code: '365', name: 'CONTRAPESOS, SUP, CORRECT.' },
    { code: '336', name: 'VARIOS' },
    { code: '385', name: 'MAZAS' },
    { code: 'OTROS', name: 'OTROS' },
    { code: '-1', name: 'SIN SUPERRUBRO' },
]

/** rubroCode -> posición en el orden 80/20. Un código ausente (no debería pasar,
 *  salvo catálogo desactualizado) cae al final vía `?? ORDER_RUBROS.length`. */
export const RUBRO_ORDER_BY_CODE: Map<string, number> = new Map(
    ORDER_RUBROS.map((r, i) => [r.code, i]),
)

function posicion(codigo: string): number {
    return RUBRO_ORDER_BY_CODE.get(codigo) ?? ORDER_RUBROS.length
}

/** Ordena por el 80/20 sin mutar el array recibido. `codigoDe` extrae el
 *  rubroCode de cada fila (distintas formas según el llamador: `IRubroEstado`
 *  usa `rubroCode`, `IOfrecimientoFila` usa `codigo`). */
export function ordenar80_20<T>(filas: T[], codigoDe: (fila: T) => string): T[] {
    return [...filas].sort((a, b) => posicion(codigoDe(a)) - posicion(codigoDe(b)))
}
