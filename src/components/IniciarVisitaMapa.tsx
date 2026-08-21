import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Navigation, RotateCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { distanciaMetros, estaFueraDeRango, RADIO_INICIO_METROS } from '@/lib/distancia'
import { formatDistancia } from '@/lib/analiticaFormat'

interface IniciarVisitaMapaProps {
    open: boolean
    nombreCliente: string
    direccion?: string
    latitud: number
    longitud: number
    iniciando?: boolean
    /** Mensaje del último intento fallido. Queda visible hasta el próximo intento. */
    error?: string | null
    onIniciar: () => void
    onCancel: () => void
}

const ICONO_CLIENTE = L.divIcon({
    className: '',
    html: '<div style="width:22px;height:22px;border-radius:50%;background:#F97316;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
})

const ICONO_VENDEDOR = L.divIcon({
    className: '',
    html: '<div style="width:16px;height:16px;border-radius:50%;background:#213D82;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
})

/**
 * Mapa full-screen previo a iniciar la visita: pin del cliente + ubicación propia en vivo
 * (`watchPosition`), solo visual — no se persiste ni se manda al backend. La coordenada real
 * que sí se guarda se sigue capturando con `capturarUbicacion()` al tocar "Iniciar visita".
 */
export default function IniciarVisitaMapa({
    open,
    nombreCliente,
    direccion,
    latitud,
    longitud,
    iniciando,
    error,
    onIniciar,
    onCancel,
}: IniciarVisitaMapaProps) {
    const mapRef = useRef<HTMLDivElement>(null)
    const mapInstance = useRef<L.Map | null>(null)
    const vendedorMarker = useRef<L.Marker | null>(null)
    const [sinUbicacion, setSinUbicacion] = useState(false)
    const [recalculando, setRecalculando] = useState(false)
    // Un intento (el watch en vivo o "Recalcular posición") falló DESPUÉS de que ya
    // hubiera un fix conocido — a diferencia de `sinUbicacion`, no habilita "iniciar
    // igual": seguimos sabiendo la distancia del último fix bueno, solo que no se pudo
    // refrescar. Se limpia en el próximo fix exitoso o al reabrir el mapa.
    const [errorActualizando, setErrorActualizando] = useState(false)
    // null = todavía no hay fix propio: no se sabe la distancia, así que no se bloquea.
    const [posicion, setPosicion] = useState<{ distanciaM: number; fueraDeRango: boolean } | null>(
        null,
    )
    // Espejo de `posicion` en un ref: los callbacks de `watchPosition` se crean UNA sola
    // vez por apertura del mapa y quedan vivos mientras dure (no se redefinen en cada
    // fix), así que leer el estado `posicion` ahí adentro devolvería siempre el valor de
    // aquel primer render — no el último fix real. Sin este ref, un error posterior a un
    // fix exitoso no podía saber que ya había una posición conocida, y pisaba el aviso de
    // distancia con "no pudimos ubicarte, podés iniciar igual" (contradictorio: el botón
    // seguía bloqueado por el fix anterior).
    const posicionRef = useRef<typeof posicion>(null)

    /** Único punto donde un intento de fix (watch o recálculo) fracasa. Solo habilita
     *  "iniciar igual" si nunca hubo un fix bueno — si ya lo hubo, el fracaso solo avisa
     *  que no se pudo refrescar, sin tocar el bloqueo que ya está vigente. */
    function marcarFixFallido() {
        if (posicionRef.current === null) {
            setSinUbicacion(true)
        } else {
            setErrorActualizando(true)
        }
    }

    function marcarFixExitoso(distanciaM: number, fueraDeRango: boolean) {
        posicionRef.current = { distanciaM, fueraDeRango }
        setPosicion(posicionRef.current)
        setSinUbicacion(false)
        setErrorActualizando(false)
    }
    // true desde que se abre el mapa hasta que watchPosition responde por primera vez
    // (éxito o error). Distinto de `sinUbicacion` (que sí deja iniciar, a propósito):
    // esto es la ventana en que el GPS todavía está resolviendo — puede durar varios
    // segundos con mala señal — y sin este estado el botón quedaba habilitado como si ya
    // se hubiera confirmado la cercanía, cuando en realidad no se sabe nada todavía.
    const [calculando, setCalculando] = useState(true)
    const fueraDeRango = posicion?.fueraDeRango ?? false

    useEffect(() => {
        if (!open || !mapRef.current) return

        setSinUbicacion(false)
        setErrorActualizando(false)
        setPosicion(null)
        posicionRef.current = null
        setCalculando(true)
        const map = L.map(mapRef.current, { zoomControl: false }).setView([latitud, longitud], 15)
        mapInstance.current = map
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
        }).addTo(map)
        L.marker([latitud, longitud], { icon: ICONO_CLIENTE }).addTo(map)
        L.circle([latitud, longitud], {
            radius: RADIO_INICIO_METROS,
            color: '#F97316',
            weight: 1,
            fillOpacity: 0.08,
        }).addTo(map)

        let watchId: number | null = null
        let yaCentrado = false

        if (navigator.geolocation) {
            watchId = navigator.geolocation.watchPosition(
                pos => {
                    setCalculando(false)
                    const { latitude, longitude, accuracy } = pos.coords
                    const distanciaM = distanciaMetros(latitud, longitud, latitude, longitude)
                    marcarFixExitoso(distanciaM, estaFueraDeRango(distanciaM, accuracy))
                    if (!vendedorMarker.current) {
                        vendedorMarker.current = L.marker([latitude, longitude], {
                            icon: ICONO_VENDEDOR,
                        }).addTo(map)
                    } else {
                        vendedorMarker.current.setLatLng([latitude, longitude])
                    }
                    if (!yaCentrado) {
                        yaCentrado = true
                        map.fitBounds(
                            [
                                [latitud, longitud],
                                [latitude, longitude],
                            ],
                            { padding: [48, 48] },
                        )
                    }
                },
                () => {
                    setCalculando(false)
                    marcarFixFallido()
                },
                { enableHighAccuracy: true, maximumAge: 5000 },
            )
        } else {
            setCalculando(false)
            marcarFixFallido()
        }

        return () => {
            if (watchId != null) navigator.geolocation.clearWatch(watchId)
            map.remove()
            mapInstance.current = null
            vendedorMarker.current = null
        }
    }, [open, latitud, longitud])

    function handleRecalcular() {
        if (!navigator.geolocation) {
            marcarFixFallido()
            return
        }
        setRecalculando(true)
        navigator.geolocation.getCurrentPosition(
            pos => {
                setRecalculando(false)
                setCalculando(false)
                const { latitude, longitude, accuracy } = pos.coords
                const distanciaM = distanciaMetros(latitud, longitud, latitude, longitude)
                marcarFixExitoso(distanciaM, estaFueraDeRango(distanciaM, accuracy))
                const map = mapInstance.current
                if (!map) return
                if (!vendedorMarker.current) {
                    vendedorMarker.current = L.marker([latitude, longitude], { icon: ICONO_VENDEDOR }).addTo(map)
                } else {
                    vendedorMarker.current.setLatLng([latitude, longitude])
                }
                map.fitBounds(
                    [
                        [latitud, longitud],
                        [latitude, longitude],
                    ],
                    { padding: [48, 48] },
                )
            },
            () => {
                setRecalculando(false)
                setCalculando(false)
                marcarFixFallido()
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
        )
    }

    function handleComoLlegar() {
        window.open(
            `https://www.google.com/maps/dir/?api=1&destination=${latitud},${longitud}&travelmode=driving`,
            '_blank',
        )
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
            <div className="flex items-center justify-between border-b border-dsline px-4 py-3">
                <div className="min-w-0">
                    <span className="text-[11px] font-extrabold uppercase tracking-wide text-dsmuted">
                        Iniciar visita
                    </span>
                    <h2 className="truncate text-[16px] font-extrabold text-[#182645]">{nombreCliente}</h2>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Cancelar"
                    onClick={onCancel}
                    className="h-9 w-9 shrink-0 bg-[#F0F2F7] text-dsmuted hover:bg-[#e3e6ee]"
                >
                    <X className="h-4 w-4" strokeWidth={2.4} />
                </Button>
            </div>

            <div ref={mapRef} data-testid="mapa-iniciar-visita" className="min-h-0 flex-1" />

            <div className="border-t border-dsline px-4 py-4">
                {direccion && <p className="mb-3 truncate text-[13px] text-dsmuted">{direccion}</p>}
                {calculando && (
                    <p className="mb-3 text-[12.5px] font-semibold text-dsmuted">
                        Calculando tu posición…
                    </p>
                )}
                {posicion && posicion.fueraDeRango && (
                    <p className="mb-3 text-[12.5px] font-semibold text-[#B45309]">
                        Estás a {formatDistancia(posicion.distanciaM)} del cliente — acercate a menos
                        de {RADIO_INICIO_METROS} m para iniciar.
                    </p>
                )}
                {posicion && !posicion.fueraDeRango && (
                    <p className="mb-3 text-[12.5px] font-semibold text-dsgreen">
                        Estás a {formatDistancia(posicion.distanciaM)} del cliente.
                    </p>
                )}
                {sinUbicacion && (
                    <p className="mb-3 text-[12.5px] font-semibold text-[#B45309]">
                        No pudimos ubicarte, pero podés iniciar igual.
                    </p>
                )}
                {/* Distinto de `sinUbicacion`: acá SÍ hay una posición conocida (el aviso de
                 *  arriba ya la muestra), solo que el último intento de refrescarla falló.
                 *  No dice "podés iniciar igual" porque el bloqueo, si lo hay, sigue vigente
                 *  con el último fix bueno. */}
                {errorActualizando && (
                    <p className="mb-3 text-[12.5px] font-semibold text-[#B45309]">
                        No pudimos actualizar tu posición. Mostrando la última conocida.
                    </p>
                )}
                {error && <p className="mb-3 text-[12.5px] font-semibold text-dsred">{error}</p>}
                <div className="mb-3 flex gap-2">
                    <Button
                        variant="outline"
                        onClick={handleRecalcular}
                        loading={recalculando}
                        className="h-11 min-w-0 flex-1 text-[13px]"
                    >
                        <RotateCw className="h-4 w-4 shrink-0" strokeWidth={2.4} />
                        <span className="truncate">Recalcular posición</span>
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleComoLlegar}
                        className="h-11 min-w-0 flex-1 text-[13px]"
                    >
                        <Navigation className="h-4 w-4 shrink-0" strokeWidth={2.4} />
                        <span className="truncate">¿Cómo llegar?</span>
                    </Button>
                </div>
                <Button
                    onClick={onIniciar}
                    loading={iniciando}
                    disabled={calculando || fueraDeRango}
                    className="h-12 w-full bg-dsgreen text-[15px] hover:bg-dsgreen/90"
                >
                    {iniciando ? 'Iniciando…' : calculando ? 'Calculando…' : 'Iniciar visita'}
                </Button>
            </div>
        </div>
    )
}
