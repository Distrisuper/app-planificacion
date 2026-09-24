import type { ICampoAlta, ICatalogoAltaItem, IDetalleAlta, IEditarAltaDTO, IEsquemaAlta, ISeccionAlta } from '@/types/planificacion'

/**
 * Helpers puros sobre el esquema del relevamiento (spec 2026-09-21, adenda). Nada acá conoce
 * una clave por su nombre salvo `nombre`, que es la única obligatoria: el resto se recorre.
 */

type Catalogos = IEsquemaAlta['catalogos']

/** `''`/espacios → null. */
export function normalizarValor(v: string | null | undefined): string | null {
    const t = (v ?? '').trim()
    return t === '' ? null : t
}

export function valorDe(detalle: IDetalleAlta | null | undefined, clave: string): string | null {
    const v = detalle?.[clave]
    return typeof v === 'string' ? v : null
}

/** El valor "guardado" de un campo, con el que se compara el diff. `nombre` cae al nombre de
 *  la card cuando el detalle no lo trae: si se comparara contra '' un no-op mandaría
 *  `{ nombre }` (es el bug que ya anotaba `ClienteNuevoSheet.confirmar`). */
function guardado(campo: ICampoAlta, detalle: IDetalleAlta | null | undefined, nombreFallback: string): string | null {
    const v = valorDe(detalle, campo.clave)
    if (campo.clave === 'nombre') return v ?? nombreFallback
    return v
}

/** State del formulario: una string por campo ('' = sin valor). */
export function estadoInicial(
    campos: ICampoAlta[],
    detalle: IDetalleAlta | null | undefined,
    nombreFallback: string,
): Record<string, string> {
    const estado: Record<string, string> = {}
    for (const c of campos) estado[c.clave] = guardado(c, detalle, nombreFallback) ?? ''
    return estado
}

/** Solo las claves cuyo valor normalizado cambió. `nombre` vacío no viaja (el botón Guardar
 *  ya lo bloquea; acá se defiende igual para no mandar nunca `nombre: null`). */
export function diffDetalle(
    campos: ICampoAlta[],
    detalle: IDetalleAlta | null | undefined,
    estado: Record<string, string>,
    nombreFallback: string,
): IEditarAltaDTO {
    const cambios: Record<string, string | null> = {}
    for (const c of campos) {
        const nuevo = normalizarValor(estado[c.clave])
        if (c.requerido && nuevo === null) continue
        if (nuevo !== guardado(c, detalle, nombreFallback)) cambios[c.clave] = nuevo
    }
    return cambios as IEditarAltaDTO
}

/** Los campos `obligatorio` sin valor: lo que falta para poder cerrar la visita de alta.
 *  Un catálogo sin ninguna opción elegible (la API mandó `catalogos: null`, o la lista vino
 *  vacía o toda inactiva) NO cuenta: el select no se puede completar, y trabar el cierre por
 *  una falla del sistema deja al vendedor con "No visité" como única salida — un hecho falso. */
export function faltantesObligatorios(campos: ICampoAlta[], estado: Record<string, string>, catalogos: Catalogos): ICampoAlta[] {
    return campos.filter(c =>
        c.obligatorio &&
        normalizarValor(estado[c.clave]) === null &&
        !(c.tipo === 'catalogo' && opcionesDeCatalogo(catalogos, c.catalogo, null).length === 0),
    )
}

export function contarCargados(campos: ICampoAlta[], estado: Record<string, string>): number {
    return campos.filter(c => normalizarValor(estado[c.clave]) !== null).length
}

/** Descripción de un código, buscando también entre los inactivos: un valor guardado que
 *  después se dio de baja se sigue mostrando. Sin match (o sin catálogos) devuelve el código. */
export function descripcionCatalogo(catalogos: Catalogos, tipo: string | undefined, codigo: string | null): string {
    if (codigo === null) return ''
    const item = tipo ? catalogos?.[tipo]?.find(i => i.codigo === codigo) : undefined
    return item?.descripcion ?? codigo
}

/** Opciones del select: los activos, más el valor actual si está inactivo (para que el select
 *  no lo "pierda" mostrando la primera opción). Sin catálogos → vacío. */
export function opcionesDeCatalogo(catalogos: Catalogos, tipo: string | undefined, valorActual: string | null): ICatalogoAltaItem[] {
    const todos = tipo ? catalogos?.[tipo] ?? [] : []
    return todos.filter(i => i.activo || (valorActual !== null && i.codigo === valorActual))
}

export function camposPorSeccion(esquema: IEsquemaAlta): { seccion: ISeccionAlta; campos: ICampoAlta[] }[] {
    return esquema.secciones
        .map(seccion => ({ seccion, campos: esquema.campos.filter(c => c.seccion === seccion.clave) }))
        .filter(g => g.campos.length > 0)
}
