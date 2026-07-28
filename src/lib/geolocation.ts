export type GeoResult =
    | { ok: true; coord: string; precisionM: number }
    | { ok: false; motivo: 'denegado' | 'sin_senal' | 'no_soportado' }

const PERMISSION_DENIED = 1

function intentar(enableHighAccuracy: boolean, timeout: number): Promise<GeoResult> {
    return new Promise(resolve => {
        navigator.geolocation.getCurrentPosition(
            pos =>
                resolve({
                    ok: true,
                    coord: `${pos.coords.latitude},${pos.coords.longitude}`,
                    precisionM: pos.coords.accuracy,
                }),
            err =>
                resolve({
                    ok: false,
                    motivo: err.code === PERMISSION_DENIED ? 'denegado' : 'sin_senal',
                }),
            { enableHighAccuracy, timeout, maximumAge: 0 },
        )
    })
}

/**
 * Captura UNA posición, en dos etapas.
 *
 * La geolocalización es OBLIGATORIA para iniciar y cerrar una visita (el backend rechaza
 * con COORD_REQUERIDA). Esto revierte a propósito §6/§10 del spec del 22/07, que la hacía
 * best-effort: el dato existe para verificar que el vendedor estuvo en el cliente, y si su
 * captura es voluntaria para el verificado, la métrica es opt-out.
 *
 * Las dos etapas son lo que hace que bloquear no vara a un vendedor honesto:
 *   1. GPS fino — falla bajo techo.
 *   2. Solo si la 1 falló por señal (NO por permiso): wifi/antena. Gruesa —cientos de
 *      metros— pero devuelve fix casi siempre que el permiso esté dado, y para confirmar
 *      presencia contra coord_cliente alcanza.
 *
 * `denegado` no reintenta: es el caso deliberado, y reintentar solo demoraría el bloqueo.
 */
export async function capturarUbicacion(): Promise<GeoResult> {
    if (!navigator.geolocation) return { ok: false, motivo: 'no_soportado' }

    const fino = await intentar(true, 8000)
    if (fino.ok || fino.motivo === 'denegado') return fino

    return intentar(false, 15000)
}
