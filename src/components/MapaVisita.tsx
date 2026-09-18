import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, Navigation, RotateCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { distanciaMetros, estaFueraDeRango, RADIO_INICIO_METROS } from '@/lib/distancia'
import { formatDistancia } from '@/lib/analiticaFormat'

interface MapaVisitaProps {
    open: boolean
    /** 'iniciar' = mapa previo a arrancar la visita, con su CTA y el gate de cercanía.
     *  'consulta' = el vendedor sólo quiere ver dónde lo está ubicando el GPS con la
     *  visita ya abierta: sin CTA, sin reposicionar, sin gate. Ver
     *  docs/superpowers/specs/2026-09-11-ver-mi-posicion-con-visita-abierta-design.md.
     *  'ubicar' = "Cliente nuevo": el comercio todavía no tiene coordenada, así que NO
     *  llegan `latitud`/`longitud` y el pin arranca donde el GPS ubica al vendedor. Sin
     *  gate (no hay contra qué medir: la coordenada se está definiendo recién ahora) y
     *  sin círculo de rango. El punto elegido sale por `onReposicionar`, igual que un
     *  ajuste manual, así el llamador recibe una coordenada aunque el vendedor no toque
     *  nada. */
    modo?: 'iniciar' | 'consulta' | 'ubicar'
    nombreCliente: string
    /** Línea de identidad bajo el título: `#10034 · DERQUI AUTOPARTES SRL`. La arma
     *  `identidadCliente` en VisitaFlow — ver ahí por qué la razón social no siempre va.
     *  Este header no es el de BottomSheet, así que la línea se dibuja acá a mano con
     *  las mismas clases que el `subtitle` de allá. */
    identidad?: string
    direccion?: string
    /** Opcionales SOLO en modo 'ubicar' (un comercio nuevo no tiene coordenada todavía).
     *  En 'iniciar' y 'consulta' siempre llegan: son el pin del cliente. */
    latitud?: number
    longitud?: number
    iniciando?: boolean
    /** Mensaje del último intento fallido. Queda visible hasta el próximo intento. */
    error?: string | null
    /** Sólo se usa en modo 'iniciar'. */
    onIniciar?: () => void
    onCancel: () => void
    /** Cada fix propio del vendedor (watch en vivo y "Recalcular posición"). El watch de
     *  este componente es de ALTA precisión, a diferencia del de useAlejadoDelCliente: por
     *  eso abrir el mapa alcanza para que el hook pueda apagar el aviso de "te alejaste". */
    onFix?: (lat: number, lon: number, precisionM: number) => void
    /** El vendedor tocó el mapa con el modo de reposicionar armado. `null` = volvió a
     *  la coordenada original ("Restablecer"). Efímero: quien lo reciba lo manda como
     *  coordCliente al iniciar, y no necesita guardarlo en ningún otro lado — ver
     *  docs/superpowers/specs/2026-09-07-reposicionar-cliente-al-iniciar-visita-design.md. */
    onReposicionar?: (coords: { lat: number; lng: number } | null) => void
}

const ICONO_CLIENTE = L.divIcon({
    className: '',
    html: '<div style="width:22px;height:22px;border-radius:50%;background:#F97316;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
})

/** Centro neutro mientras el modo 'ubicar' todavía no tiene ningún fix: el país entero,
 *  con zoom bajo. No representa al comercio — el pin recién aparece con el primer fix. */
const CENTRO_SIN_PIN: [number, number] = [-38.4, -63.6]

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
export default function MapaVisita({
    open,
    modo = 'iniciar',
    nombreCliente,
    identidad,
    direccion,
    latitud,
    longitud,
    iniciando,
    error,
    onIniciar,
    onCancel,
    onFix,
    onReposicionar,
}: MapaVisitaProps) {
    const esConsulta = modo === 'consulta'
    // "Cliente nuevo": no hay pin previo ni gate — ver el docstring de `modo`.
    const esUbicar = modo === 'ubicar'
    const tienePinInicial = latitud != null && longitud != null
    const mapRef = useRef<HTMLDivElement>(null)
    const mapInstance = useRef<L.Map | null>(null)
    const vendedorMarker = useRef<L.Marker | null>(null)
    const clienteMarker = useRef<L.Marker | null>(null)
    const circuloRango = useRef<L.Circle | null>(null)
    // Espejo de `overrideCliente` en un ref, mismo motivo que `posicionRef`: los
    // callbacks de watchPosition/recalcular se crean una sola vez por apertura del
    // mapa y necesitan leer el override VIGENTE al momento del fix, no el de cuando
    // se armaron.
    const overrideRef = useRef<{ lat: number; lng: number } | null>(null)
    // Último fix crudo del vendedor (no el derivado que guarda posicionRef): hace
    // falta para recalcular distancia al instante cuando se reposiciona al cliente,
    // sin esperar el próximo tick de watchPosition.
    const vendedorFixRef = useRef<{ lat: number; lng: number; accuracy: number } | null>(null)
    const modoReposicionarRef = useRef(false)
    const [modoReposicionar, setModoReposicionar] = useState(false)
    const [overrideCliente, setOverrideCliente] = useState<{ lat: number; lng: number } | null>(
        null,
    )
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
        setModoReposicionar(false)
        modoReposicionarRef.current = false
        setOverrideCliente(null)
        overrideRef.current = null
        vendedorFixRef.current = null
        // Sin pin inicial (modo 'ubicar') el encuadre real llega con el primer fix propio:
        // hasta entonces el mapa arranca alejado sobre un centro neutro, en vez de saltar
        // desde una coordenada inventada que el vendedor podría leer como "el comercio
        // está acá".
        const map = L.map(mapRef.current, { zoomControl: false }).setView(
            tienePinInicial ? [latitud, longitud] : CENTRO_SIN_PIN,
            tienePinInicial ? 15 : 4,
        )
        mapInstance.current = map
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
        }).addTo(map)
        if (tienePinInicial) {
            clienteMarker.current = L.marker([latitud, longitud], { icon: ICONO_CLIENTE }).addTo(map)
            // El círculo dibuja el radio del gate: en 'ubicar' no hay gate, así que
            // tampoco va el círculo — insinuaría un límite que no existe.
            circuloRango.current = L.circle([latitud, longitud], {
                radius: RADIO_INICIO_METROS,
                color: '#F97316',
                weight: 1,
                fillOpacity: 0.08,
            }).addTo(map)
        }

        /** Crea el pin del comercio si todavía no existe, o lo mueve si ya estaba. En
         *  'ubicar' la primera llamada es la que lo hace aparecer. */
        function ponerPin(lat: number, lng: number) {
            if (!clienteMarker.current) {
                clienteMarker.current = L.marker([lat, lng], { icon: ICONO_CLIENTE }).addTo(map)
            } else {
                clienteMarker.current.setLatLng([lat, lng])
            }
            circuloRango.current?.setLatLng([lat, lng])
        }

        // Solo dispara si el modo está armado (botón "Reposicionar cliente"): un tap
        // suelto para hacer zoom/pan no debe mover al cliente por accidente.
        function handleClickMapa(e: L.LeafletMouseEvent) {
            if (!modoReposicionarRef.current) return
            const { lat, lng } = e.latlng
            modoReposicionarRef.current = false
            setModoReposicionar(false)
            overrideRef.current = { lat, lng }
            setOverrideCliente({ lat, lng })
            ponerPin(lat, lng)
            if (vendedorFixRef.current) {
                const { lat: vLat, lng: vLng, accuracy } = vendedorFixRef.current
                const distanciaM = distanciaMetros(lat, lng, vLat, vLng)
                marcarFixExitoso(distanciaM, estaFueraDeRango(distanciaM, accuracy))
            }
            onReposicionar?.({ lat, lng })
        }
        map.on('click', handleClickMapa)

        let watchId: number | null = null
        let yaCentrado = false

        if (navigator.geolocation) {
            watchId = navigator.geolocation.watchPosition(
                pos => {
                    setCalculando(false)
                    const { latitude, longitude, accuracy } = pos.coords
                    vendedorFixRef.current = { lat: latitude, lng: longitude, accuracy }
                    onFix?.(latitude, longitude, accuracy)
                    // 'ubicar': el primer fix propio ES el punto de partida del comercio.
                    // Se avisa por `onReposicionar` —el mismo canal del ajuste manual— para
                    // que el llamador tenga una coordenada aunque el vendedor no toque nada.
                    if (esUbicar && overrideRef.current === null) {
                        overrideRef.current = { lat: latitude, lng: longitude }
                        setOverrideCliente({ lat: latitude, lng: longitude })
                        ponerPin(latitude, longitude)
                        onReposicionar?.({ lat: latitude, lng: longitude })
                    }
                    const punto =
                        overrideRef.current ??
                        (tienePinInicial ? { lat: latitud, lng: longitud } : null)
                    if (punto) {
                        const distanciaM = distanciaMetros(punto.lat, punto.lng, latitude, longitude)
                        marcarFixExitoso(distanciaM, estaFueraDeRango(distanciaM, accuracy))
                    } else {
                        marcarFixExitoso(0, false)
                    }
                    if (!vendedorMarker.current) {
                        vendedorMarker.current = L.marker([latitude, longitude], {
                            icon: ICONO_VENDEDOR,
                        }).addTo(map)
                    } else {
                        vendedorMarker.current.setLatLng([latitude, longitude])
                    }
                    if (!yaCentrado) {
                        yaCentrado = true
                        if (tienePinInicial) {
                            map.fitBounds(
                                [
                                    [latitud, longitud],
                                    [latitude, longitude],
                                ],
                                { padding: [48, 48] },
                            )
                        } else {
                            // Sin pin previo los dos puntos coinciden: `fitBounds` sobre un
                            // rectángulo de área cero da un zoom inútil. Centrar y acercar.
                            map.setView([latitude, longitude], 17)
                        }
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
            // Optional chaining: al desmontar, `navigator.geolocation` puede ya no estar
            // (un test que restaura los globals antes del cleanup de React, o un navegador
            // que revoca el permiso). Sin esto el unmount explota y se lleva puesto el
            // `map.remove()` de abajo, que es el que libera el canvas de Leaflet.
            if (watchId != null) navigator.geolocation?.clearWatch(watchId)
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
                vendedorFixRef.current = { lat: latitude, lng: longitude, accuracy }
                onFix?.(latitude, longitude, accuracy)
                const map = mapInstance.current
                // 'ubicar' sin pin todavía (el watch nunca pudo resolver y el vendedor tocó
                // "Recalcular"): este fix es el que estrena el pin del comercio.
                if (esUbicar && overrideRef.current === null && map) {
                    overrideRef.current = { lat: latitude, lng: longitude }
                    setOverrideCliente({ lat: latitude, lng: longitude })
                    clienteMarker.current = L.marker([latitude, longitude], {
                        icon: ICONO_CLIENTE,
                    }).addTo(map)
                    onReposicionar?.({ lat: latitude, lng: longitude })
                }
                const punto =
                    overrideRef.current ?? (tienePinInicial ? { lat: latitud, lng: longitud } : null)
                if (punto) {
                    const distanciaM = distanciaMetros(punto.lat, punto.lng, latitude, longitude)
                    marcarFixExitoso(distanciaM, estaFueraDeRango(distanciaM, accuracy))
                } else {
                    marcarFixExitoso(0, false)
                }
                if (!map) return
                if (!vendedorMarker.current) {
                    vendedorMarker.current = L.marker([latitude, longitude], { icon: ICONO_VENDEDOR }).addTo(map)
                } else {
                    vendedorMarker.current.setLatLng([latitude, longitude])
                }
                if (tienePinInicial) {
                    map.fitBounds(
                        [
                            [latitud, longitud],
                            [latitude, longitude],
                        ],
                        { padding: [48, 48] },
                    )
                } else {
                    map.setView([latitude, longitude], 17)
                }
            },
            () => {
                setRecalculando(false)
                setCalculando(false)
                marcarFixFallido()
            },
            // `maximumAge: 0` (que tenía este código) exige una lectura estrictamente
            // nueva: en equipos sin GPS (una PC de escritorio) el proveedor de ubicación
            // por red resuelve UNA vez y no puede producir otra a pedido, así que el
            // pedido quedaba esperando hasta agotar el timeout y terminaba siempre en
            // "No pudimos actualizar tu posición" — mismo motivo, documentado, por el
            // que `capturarUbicacion()` tampoco usa 0 (ver src/lib/geolocation.ts). Un
            // margen chico sigue sirviendo como "recalcular": no reusa el fix inicial
            // del montaje (que ya lleva más de 5 s dando vueltas para cuando el
            // vendedor llega a tocar el botón), solo tolera un fix genuinamente reciente.
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
        )
    }

    function handleComoLlegar() {
        // Mismo punto que ve el vendedor en el mapa: si reposicionó al cliente, "Cómo
        // llegar" tiene que apuntar ahí, no a la coordenada original que ya se sabe mal.
        const punto =
            overrideRef.current ?? (tienePinInicial ? { lat: latitud, lng: longitud } : null)
        if (!punto) return
        window.open(
            `https://www.google.com/maps/dir/?api=1&destination=${punto.lat},${punto.lng}&travelmode=driving`,
            '_blank',
        )
    }

    function handleRestablecer() {
        // Sólo existe con pin inicial: en 'ubicar' no hay coordenada original a la que
        // volver (el botón ni se dibuja), y sin este guard el pin saltaría a undefined.
        if (!tienePinInicial) return
        overrideRef.current = null
        setOverrideCliente(null)
        clienteMarker.current?.setLatLng([latitud, longitud])
        circuloRango.current?.setLatLng([latitud, longitud])
        if (vendedorFixRef.current) {
            const { lat, lng, accuracy } = vendedorFixRef.current
            const distanciaM = distanciaMetros(latitud, longitud, lat, lng)
            marcarFixExitoso(distanciaM, estaFueraDeRango(distanciaM, accuracy))
        }
        onReposicionar?.(null)
    }

    function handleArmarReposicionar() {
        modoReposicionarRef.current = true
        setModoReposicionar(true)
    }

    function handleCancelarReposicionar() {
        modoReposicionarRef.current = false
        setModoReposicionar(false)
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
            <div className="flex items-center justify-between border-b border-dsline px-4 py-3">
                <div className="min-w-0">
                    <span className="text-[11px] font-extrabold uppercase tracking-wide text-dsmuted">
                        {esConsulta ? 'Tu posición' : esUbicar ? 'Ubicar el comercio' : 'Iniciar visita'}
                    </span>
                    <h2 className="truncate text-[16px] font-extrabold text-[#182645]">{nombreCliente}</h2>
                    {identidad && (
                        <p className="truncate text-[11.5px] font-semibold leading-tight text-dsmuted">
                            {identidad}
                        </p>
                    )}
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
                {/* La distancia no aplica en 'ubicar': el pin y el vendedor son el mismo
                 *  punto hasta que él lo mueva, y moverlo no es estar lejos de nada — es
                 *  marcar dónde está el local. */}
                {!esUbicar && posicion && posicion.fueraDeRango && (
                    <p className="mb-3 text-[12.5px] font-semibold text-[#B45309]">
                        Estás a {formatDistancia(posicion.distanciaM)} del cliente
                        {esConsulta
                            ? '.'
                            : ` — acercate a menos de ${RADIO_INICIO_METROS} m para iniciar.`}
                    </p>
                )}
                {!esUbicar && posicion && !posicion.fueraDeRango && (
                    <p className="mb-3 text-[12.5px] font-semibold text-dsgreen">
                        Estás a {formatDistancia(posicion.distanciaM)} del cliente.
                    </p>
                )}
                {esUbicar && overrideCliente && (
                    <p className="mb-3 text-[12.5px] font-semibold text-dsgreen">
                        Ubicación marcada. Si el local está en otro lado, ajustala.
                    </p>
                )}
                {sinUbicacion && (
                    <p className="mb-3 text-[12.5px] font-semibold text-[#B45309]">
                        {esConsulta
                            ? 'No pudimos ubicarte. Probá al aire libre y tocá "Recalcular posición".'
                            : esUbicar
                              ? 'No pudimos ubicarte: la visita va a quedar sin la ubicación del comercio. Podés iniciar igual.'
                              : 'No pudimos ubicarte, pero podés iniciar igual.'}
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
                {!esConsulta && modoReposicionar && (
                    <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-dashed border-[#F59E0B] bg-[#FFFBEB] px-3 py-2">
                        <span className="text-[12.5px] font-semibold text-[#92400E]">
                            {esUbicar
                                ? 'Tocá el mapa donde está el comercio'
                                : 'Tocá el mapa para mover al cliente'}
                        </span>
                        <button
                            type="button"
                            onClick={handleCancelarReposicionar}
                            className="shrink-0 text-[12.5px] font-semibold text-dsmuted underline"
                        >
                            Cancelar reposición
                        </button>
                    </div>
                )}
                {/* "Restablecer" necesita una coordenada original a la que volver: en
                 *  'ubicar' no existe (el pin lo puso el GPS recién), así que no va. */}
                {!esConsulta && !esUbicar && overrideCliente && !modoReposicionar && (
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <span className="text-[12.5px] font-semibold text-dsmuted">
                            Posición ajustada para esta visita
                        </span>
                        <button
                            type="button"
                            onClick={handleRestablecer}
                            className="shrink-0 text-[12.5px] font-semibold underline text-[#213D82]"
                        >
                            Restablecer
                        </button>
                    </div>
                )}
                {!esConsulta && !modoReposicionar && (
                    <Button
                        variant="outline"
                        onClick={handleArmarReposicionar}
                        className="mb-2 h-11 w-full border-[#F3D9A4] bg-[#FFFBEB] text-[13px] text-[#92400E] hover:bg-[#FEF3C7]"
                    >
                        <MapPin className="h-4 w-4 shrink-0" strokeWidth={2.4} />
                        {esUbicar
                            ? overrideCliente
                                ? 'Ajustar la ubicación'
                                : 'Marcar la ubicación'
                            : overrideCliente
                              ? 'Reposicionar de nuevo'
                              : 'Reposicionar cliente'}
                    </Button>
                )}
                <div className="mb-3 flex gap-2">
                    <Button
                        variant="outline"
                        onClick={handleRecalcular}
                        loading={recalculando}
                        className="h-11 min-w-0 flex-1 text-[13px]"
                    >
                        {/* `Button` ya antepone su propio spinner cuando `loading`. Sin
                         *  este condicional, el RotateCw estático quedaba al lado del
                         *  spinner sin moverse — dos íconos a la vez, y el que sí indica
                         *  "está pasando algo" competía con uno que parece congelado. */}
                        {!recalculando && <RotateCw className="h-4 w-4 shrink-0" strokeWidth={2.4} />}
                        <span className="truncate">Recalcular posición</span>
                    </Button>
                    {/* "¿Cómo llegar?" no tiene sentido en 'ubicar': el destino sería el
                     *  punto donde el vendedor ya está parado. */}
                    {!esUbicar && (
                        <Button
                            variant="outline"
                            onClick={handleComoLlegar}
                            className="h-11 min-w-0 flex-1 text-[13px]"
                        >
                            <Navigation className="h-4 w-4 shrink-0" strokeWidth={2.4} />
                            <span className="truncate">¿Cómo llegar?</span>
                        </Button>
                    )}
                </div>
                {!esConsulta && (
                    <Button
                        onClick={onIniciar}
                        loading={iniciando}
                        // `fueraDeRango` no bloquea en 'ubicar': no hay coordenada previa
                        // contra la cual estar lejos — se está definiendo ahora mismo.
                        disabled={calculando || (!esUbicar && fueraDeRango) || modoReposicionar}
                        className="h-12 w-full bg-dsgreen text-[15px] hover:bg-dsgreen/90"
                    >
                        {iniciando ? 'Iniciando…' : calculando ? 'Calculando…' : 'Iniciar visita'}
                    </Button>
                )}
            </div>
        </div>
    )
}
