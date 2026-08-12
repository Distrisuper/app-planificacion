/**
 * El código de negocio de un error de la API, o null.
 *
 * El front ramifica por `code`, no por status: un 409 significa cinco cosas distintas
 * (CICLO_NO_ABIERTO, CICLO_ABIERTO_EXISTENTE, VISITA_YA_CERRADA, RUBRO_DE_PROPUESTA…).
 * Vive en un solo lugar para no destripar err.response.data.code en cada componente.
 */
export function errorCode(err: unknown): string | null {
    const code = (err as { response?: { data?: { code?: unknown } } })?.response?.data?.code
    return typeof code === 'string' ? code : null
}

/**
 * El body completo de un error de negocio (además de `code`, trae los campos extra que
 * CustomError.details serializa: por ejemplo `semanas` en SEMANA_FUERA_DEL_SET). null si no
 * es un error de negocio con body.
 */
export function errorData<T extends Record<string, unknown> = Record<string, unknown>>(
    err: unknown,
): (T & { code?: string }) | null {
    const data = (err as { response?: { data?: T & { code?: string } } })?.response?.data
    return data ?? null
}
