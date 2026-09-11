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
 * Histéresis simétrica, ambos lados exigen evidencia concluyente incluso en el caso
 * contrario para el fix: se ENTRA con `estaFueraDeRango` (`distancia - precisión > radio`
 * — lejos aun en el MEJOR caso del fix) y se SALE con `distancia + precisión <= radio`
 * (cerca aun en el PEOR caso). Un umbral único (comparar solo `distancia`) haría que un
 * fix oscilando en el borde prendiera y apagara el aviso en cada tick; y una salida sobre
 * la distancia cruda sin descontar nada deja, para un fix impreciso, una banda muerta
 * donde no puede probar ni que sigue lejos ni que ya volvió.
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
    // (mismo motivo que posicionRef en MapaVisita) y necesitan leer el estado
    // VIGENTE de `alejado`, no el del render en que se armaron.
    const alejadoRef = useRef(false)
    const wakeLockRef = useRef<{ release: () => void } | null>(null)

    const tieneCoords = latitud != null && longitud != null
    const habilitado = activo && tieneCoords

    function evaluarFix(lat: number, lon: number, precisionM: number) {
        if (!tieneCoords) return
        const d = distanciaMetros(lat, lon, latitud as number, longitud as number)
        setDistanciaM(d)
        if (alejadoRef.current) {
            // Salida: evidencia positiva de CERCANÍA, aun en el PEOR caso para el fix —
            // espejo exacto de la entrada de abajo (`estaFueraDeRango`), que exige
            // evidencia positiva de lejanía en el MEJOR caso (`d - p`). Antes esto
            // comparaba contra la distancia cruda, sin descontar nada, y quedaba una
            // banda muerta (100 < d <= 100 + precisión) donde un fix grueso no podía
            // probar ni lejanía ni cercanía: el aviso quedaba pegado para siempre con
            // el watch pasivo (baja precisión a propósito). Una puerta que descartaba
            // cualquier fix con precisión > 100 (versión anterior) tapaba esa banda,
            // pero de paso bloqueaba la ENTRADA con fixes lejanos e imprecisos — el
            // caso exacto de un override de ubicación de Chrome DevTools (panel
            // Sensors), que no permite configurar la precisión y reporta un valor fijo
            // por encima del radio. Ver
            // docs/superpowers/specs/2026-09-11-ver-mi-posicion-con-visita-abierta-design.md.
            if (d + precisionM <= RADIO_INICIO_METROS) {
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
