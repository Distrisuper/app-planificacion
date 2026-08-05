import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Navigation, RotateCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

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

    useEffect(() => {
        if (!open || !mapRef.current) return

        setSinUbicacion(false)
        const map = L.map(mapRef.current, { zoomControl: false }).setView([latitud, longitud], 15)
        mapInstance.current = map
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
        }).addTo(map)
        L.marker([latitud, longitud], { icon: ICONO_CLIENTE }).addTo(map)

        let watchId: number | null = null
        let yaCentrado = false

        if (navigator.geolocation) {
            watchId = navigator.geolocation.watchPosition(
                pos => {
                    const { latitude, longitude } = pos.coords
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
                () => setSinUbicacion(true),
                { enableHighAccuracy: true, maximumAge: 5000 },
            )
        } else {
            setSinUbicacion(true)
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
            setSinUbicacion(true)
            return
        }
        setRecalculando(true)
        navigator.geolocation.getCurrentPosition(
            pos => {
                setRecalculando(false)
                const { latitude, longitude } = pos.coords
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
                setSinUbicacion(true)
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
                {sinUbicacion && (
                    <p className="mb-3 text-[12.5px] font-semibold text-[#B45309]">
                        No pudimos ubicarte, pero podés iniciar igual.
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
                    className="h-12 w-full bg-dsgreen text-[15px] hover:bg-dsgreen/90"
                >
                    {iniciando ? 'Iniciando…' : 'Iniciar visita'}
                </Button>
            </div>
        </div>
    )
}
