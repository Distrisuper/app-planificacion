import type { IRubroEstado, IVisitClientCard } from '@/types/planificacion'

/** Los dos valores de `bonificacion` que marcan a un cliente suscriptor. Salen de
 *  `MapaCalorService.js:362` de api-node-lupa, el único lugar del ecosistema que se
 *  acordó del 49 — el resto del código habla solo del 45. */
const BONIFICACIONES_SUSCRIPTOR = [45, 49]

export interface IDescuentoMarca {
    code: string
    nombre: string
    valor: number
}

/**
 * Cliente con acuerdo de suscripción: 45% (o 49%) de bonificación global a cambio de un
 * fee mensual que se le factura bajo la marca `120`.
 *
 * Importa porque **el descuento por marca NO se acumula con esa bonificación**: el motor
 * de precios de Lupa lo neutraliza (`priceUtils.js:52`, factor 1). Mostrarle un descuento
 * por marca a un suscriptor es prometerle algo que la factura no le va a aplicar.
 *
 * Se mira `bonusDiscount` y NO `generalDiscount`, aunque api-vendedores filtre por ese
 * otro: `general_discount` vale 0 para TODOS los clientes, porque el modelo dbt lee
 * `discounts->>'byGeneral'` y client-service nunca emite esa clave. Ver §3.2 del spec.
 */
export function esSuscriptor(
    cliente: Pick<IVisitClientCard, 'bonusDiscount'> | null | undefined,
): boolean {
    const bonificacion = cliente?.bonusDiscount
    if (bonificacion == null) return false
    return BONIFICACIONES_SUSCRIPTOR.includes(Number(bonificacion))
}

/** `(elem->>'value')::numeric` puede volver como string si pg no tiene parser para
 *  numeric. Un descuento de 0 o negativo no es un descuento: se descarta acá y no en
 *  cada pantalla. */
function valorValido(value: unknown): number | null {
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * `brand_code` → % de descuento. **Vacío si el cliente es suscriptor**: esa es la única
 * puerta por la que se aplica la regla, así que ninguna pantalla necesita conocerla.
 *
 * El valor es un escalar y no una lista: la PK de `client_brand_discount` en MySQL es
 * `(client_code, brand_code)`, así que un cliente no puede tener dos descuentos para la
 * misma marca. El `# LIQUIDOS FRENO #` del `description` es parte del NOMBRE de la
 * entrada, no una segunda dimensión.
 */
export function descuentosPorCodigo(
    cliente: IVisitClientCard | null | undefined,
): Map<string, number> {
    const mapa = new Map<string, number>()
    if (!cliente || esSuscriptor(cliente)) return mapa

    for (const d of cliente.brandDiscounts ?? []) {
        const valor = valorValido(d.value)
        const code = d.code?.trim()
        if (valor === null || !code) continue
        mapa.set(code, valor)
    }
    return mapa
}

/** `'COBREQ # LIQUIDOS FRENO #'` → `'COBREQ · LIQUIDOS FRENO'`. Administración envuelve
 *  la línea entre `#`; el texto llega crudo desde el JSONB. app-vendedores lo muestra sin
 *  limpiar y se lee mal. */
export function nombreDescuento(description: string): string {
    return (description ?? '')
        .split('#')
        .map(parte => parte.trim())
        .filter(Boolean)
        .join(' · ')
}

/** La ficha completa, para el sheet de consulta. Ordenada por % descendente: es el orden
 *  con el que el vendedor busca con qué empujar. */
export function listaDescuentos(
    cliente: IVisitClientCard | null | undefined,
): IDescuentoMarca[] {
    if (!cliente || esSuscriptor(cliente)) return []

    return (cliente.brandDiscounts ?? [])
        .map(d => {
            const valor = valorValido(d.value)
            const code = d.code?.trim()
            if (valor === null || !code) return null
            return { code, nombre: nombreDescuento(d.description), valor }
        })
        .filter((d): d is IDescuentoMarca => d !== null)
        .sort((a, b) => b.valor - a.valor)
}

/**
 * Pega el descuento del cliente a cada marca de `rubroStatus`, **antes** de que
 * `filas.ts` construya las filas.
 *
 * Es acá y no en un prop de `OfrecimientoTable` porque el descuento tendría que bajar
 * cuatro niveles (`OfrecimientoTable` → `SegmentoOfrecimientos`/tabla → `FilaOfrecimiento`
 * → `SubFilasMarcas`) atravesando tres componentes a los que no les importa. Viajando
 * dentro de la marca aprovecha el pass-through que los builders ya hacen
 * (`marcas: s?.marcas ?? []`), y `filas.ts` no se toca.
 */
export function conDescuentos(
    rubroStatus: IRubroEstado[],
    cliente: IVisitClientCard | null | undefined,
): IRubroEstado[] {
    const descuentos = descuentosPorCodigo(cliente)
    // Identidad referencial cuando no hay nada que pegar: `useMemo` en el llamador no
    // recalcula, y las filas no se reconstruyen por gusto.
    if (descuentos.size === 0) return rubroStatus

    return rubroStatus.map(r => ({
        ...r,
        marcas: r.marcas.map(m => {
            const descuento = descuentos.get(m.code?.trim())
            return descuento === undefined ? m : { ...m, descuento }
        }),
    }))
}
