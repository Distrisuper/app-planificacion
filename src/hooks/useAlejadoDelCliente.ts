import { useEffect, useRef, useState } from 'react'
import { distanciaMetros, estaFueraDeRango, RADIO_INICIO_METROS } from '@/lib/distancia'

interface UseAlejadoDelClienteArgs {
    /** true = hay una visita en curso con este cliente. false o sin coordenadas =
     *  el hook queda inactivo: no monta watch, no pide wake lock. */
    activo: boolean
    latitud: number | null | undefined
    longitud: number | null | undefined
}

interface UseAlejadoDelClienteResult {
    alejado: boolean
    distanciaM: number | null
    /** Entrada externa al mismo criterio que usa el watch interno. La usa MapaVisita en
     *  modo consulta, cuyo watch SÍ es de alta precisión: es lo que le permite al vendedor
     *  desmentir el aviso abriendo el mapa. */
    evaluarFix: (lat: number, lon: number, precisionM: number) => void
}

/**
 * Detecta que el vendedor se alejó del cliente de la visita en curso —
 * ver docs/superpowers/specs/2026-09-08-aviso-alejado-del-cliente-design.md.
 *
 * Dos disparadores: `watchPosition` mientras la app está al frente, y un chequeo puntual
 * con `getCurrentPosition` al volver de background (`visibilitychange`) — sin este segundo,
 * la feature no cubre su caso principal (se fue con el celu guardado).
 *
 * Histéresis: se ENTRA a `alejado` con `estaFueraDeRango` (distancia menos precisión mayor
 * al radio — evidencia positiva de lejanía). Se SALE solo cuando la distancia CRUDA vuelve
 * a estar dentro del radio, sin descontar precisión — un umbral único haría que un fix
 * oscilando en el borde prendiera y apagara el aviso en cada tick.
 *
 * `enableHighAccuracy: false`: una visita dura media hora y no vale la pena mantener el GPS
 * fino prendido todo ese rato para una advertencia — un fix grueso, con la precisión ya
 * descontada, simplemente no dispara en vez de disparar mal.
 */
export function useAlejadoDelCliente({
    activo,
    latitud,
    longitud,
}: UseAlejadoDelClienteArgs): UseAlejadoDelClienteResult {
    const [alejado, setAlejado] = useState(false)
    const [distanciaM, setDistanciaM] = useState<number | null>(null)
    // Los callbacks de watchPosition/visibilitychange se crean una sola vez por montaje
    // (mismo motivo que posicionRef en IniciarVisitaMapa) y necesitan leer el estado
    // VIGENTE de `alejado`, no el del render en que se armaron.
    const alejadoRef = useRef(false)
    const wakeLockRef = useRef<{ release: () => void } | null>(null)

    const tieneCoords = latitud != null && longitud != null
    const habilitado = activo && tieneCoords

    function evaluarFix(lat: number, lon: number, precisionM: number) {
        if (!tieneCoords) return
        // Puerta de precisión: un fix más impreciso que el propio radio no puede concluir
        // nada, ni para entrar ni para salir. Sin esto, entrada y salida usan escalas
        // distintas —entrar descuenta la precisión, salir mide la distancia cruda— y entre
        // las dos queda una banda muerta (100 < d <= 100 + precisión) donde el fix ni entra
        // ni sale. Como el watch de acá corre en baja precisión a propósito, casi todos sus
        // fixes caen en esa banda: se entraba a `alejado` con un fix bueno y después ningún
        // fix grueso alcanzaba para salir, con el vendedor parado en el local. Ver
        // docs/superpowers/specs/2026-09-11-ver-mi-posicion-con-visita-abierta-design.md.
        if (precisionM > RADIO_INICIO_METROS) return
        const d = distanciaMetros(lat, lon, latitud as number, longitud as number)
        setDistanciaM(d)
        if (alejadoRef.current) {
            // Salida: distancia cruda, sin descontar precisión.
            if (d <= RADIO_INICIO_METROS) {
                alejadoRef.current = false
                setAlejado(false)
            }
        } else if (estaFueraDeRango(d, precisionM)) {
            alejadoRef.current = true
            setAlejado(true)
        }
    }

    async function pedirWakeLock() {
        const wakeLock = (navigator as any).wakeLock
        if (!wakeLock) return
        try {
            wakeLockRef.current = await wakeLock.request('screen')
        } catch {
            // Best-effort: batería baja, o la API rechaza por cualquier otro motivo. El
            // aviso sigue funcionando, solo con menos ventana de detección.
        }
    }

    useEffect(() => {
        if (!habilitado) return

        alejadoRef.current = false
        setAlejado(false)
        setDistanciaM(null)

        pedirWakeLock()

        let watchId: number | null = null
        if (navigator.geolocation) {
            watchId = navigator.geolocation.watchPosition(
                pos => evaluarFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
                () => {},
                { enableHighAccuracy: false },
            )
        }

        function onVisibilityChange() {
            if (document.hidden) return
            // El wake lock se libera solo al pasar a hidden; hay que volver a pedirlo acá.
            pedirWakeLock()
            if (!navigator.geolocation) return
            navigator.geolocation.getCurrentPosition(
                pos => evaluarFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
                () => {},
                { enableHighAccuracy: false },
            )
        }
        document.addEventListener('visibilitychange', onVisibilityChange)

        return () => {
            // Optional chaining a propósito, no solo defensivo: `navigator.geolocation`
            // puede haber dejado de existir para cuando este cleanup corre (en los tests,
            // el mock del navigator se retira en su propio afterEach, que puede correr
            // antes que el unmount de React limpie este watch).
            if (watchId != null) navigator.geolocation?.clearWatch(watchId)
            document.removeEventListener('visibilitychange', onVisibilityChange)
            wakeLockRef.current?.release()
            wakeLockRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [habilitado, latitud, longitud])

    return {
        alejado: habilitado && alejado,
        distanciaM: habilitado ? distanciaM : null,
        evaluarFix,
    }
}
