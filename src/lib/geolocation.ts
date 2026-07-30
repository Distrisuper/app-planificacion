export type GeoResult =
    | { ok: true; coord: string; precisionM: number }
    | { ok: false; motivo: 'denegado' | 'sin_senal' | 'no_soportado' }

const PERMISSION_DENIED = 1

// El backend valida el string con una regex que limita a 8 decimales (sobra para GPS, ~1mm
// de precisión); los doubles crudos de `coords` traen hasta 15-17, así que hay que truncarlos
// acá o el backend rechaza una coordenada real con COORD_REQUERIDA.
function formatearCoord(valor: number): string {
    return valor.toFixed(8)
}

/**
 * Cuánto se acepta de antigüedad en un fix ya resuelto por el navegador.
 *
 * NO puede ser 0. Con `maximumAge: 0` se exige una lectura nueva y se prohíbe la que el
 * navegador ya tiene: en equipos sin GPS (una PC de escritorio, o un celu bajo techo) el
 * navegador resuelve la posición por red una vez y no puede producir otra a pedido, así
 * que las dos etapas esperaban un fix que nunca llegaba y expiraban recién a los 23s.
 *
 * Tampoco puede ser generoso: la coordenada existe para verificar que el vendedor estuvo
 * en el cliente, y un margen grande dejaría cerrar la visita con la posición del inicio.
 * Un minuto es más que suficiente para no caminar a otro cliente y evita esa ventana.
 */
const MAX_AGE_FINO_MS = 15_000
const MAX_AGE_GRUESO_MS = 60_000

function intentar(
    enableHighAccuracy: boolean,
    timeout: number,
    maximumAge: number,
): Promise<GeoResult> {
    return new Promise(resolve => {
        navigator.geolocation.getCurrentPosition(
            pos =>
                resolve({
                    ok: true,
                    coord: `${formatearCoord(pos.coords.latitude)},${formatearCoord(pos.coords.longitude)}`,
                    precisionM: pos.coords.accuracy,
                }),
            err =>
                resolve({
                    ok: false,
                    motivo: err.code === PERMISSION_DENIED ? 'denegado' : 'sin_senal',
                }),
            { enableHighAccuracy, timeout, maximumAge },
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

    const fino = await intentar(true, 8000, MAX_AGE_FINO_MS)
    if (fino.ok || fino.motivo === 'denegado') return fino

    return intentar(false, 15000, MAX_AGE_GRUESO_MS)
}
