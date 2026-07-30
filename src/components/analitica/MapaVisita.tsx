import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { TOLERANCIA_METROS } from '@/lib/analiticaFormat'
import type { ICoord } from '@/types/analitica'

interface MapaVisitaProps {
    coordInicio: ICoord | null
    coordFinal: ICoord | null
    coordCliente: ICoord
}

const punto = (color: string, tamano: number) =>
    L.divIcon({
        className: '',
        html: `<div style="width:${tamano}px;height:${tamano}px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
        iconSize: [tamano, tamano],
        iconAnchor: [tamano / 2, tamano / 2],
    })

const ICONO_CLIENTE = punto('#F97316', 22)
const ICONO_INICIO = punto('#213D82', 16)
const ICONO_FIN = punto('#10B981', 16)

export default function MapaVisita({ coordInicio, coordFinal, coordCliente }: MapaVisitaProps) {
    const contenedor = useRef<HTMLDivElement>(null)
    const mapa = useRef<L.Map | null>(null)

    useEffect(() => {
        if (!contenedor.current || mapa.current) return

        mapa.current = L.map(contenedor.current, { attributionControl: false }).setView(
            [coordCliente.lat, coordCliente.lng],
            16,
        )
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapa.current)

        L.marker([coordCliente.lat, coordCliente.lng], { icon: ICONO_CLIENTE }).addTo(mapa.current)
        // El círculo hace visible por qué una visita quedó validada o no.
        L.circle([coordCliente.lat, coordCliente.lng], {
            radius: TOLERANCIA_METROS,
            color: '#F97316',
            weight: 1,
            fillOpacity: 0.08,
        }).addTo(mapa.current)

        const puntos: L.LatLngExpression[] = [[coordCliente.lat, coordCliente.lng]]
        if (coordInicio) {
            L.marker([coordInicio.lat, coordInicio.lng], { icon: ICONO_INICIO }).addTo(mapa.current)
            puntos.push([coordInicio.lat, coordInicio.lng])
        }
        if (coordFinal) {
            L.marker([coordFinal.lat, coordFinal.lng], { icon: ICONO_FIN }).addTo(mapa.current)
            puntos.push([coordFinal.lat, coordFinal.lng])
        }
        mapa.current.fitBounds(L.latLngBounds(puntos).pad(0.4))

        return () => {
            mapa.current?.remove()
            mapa.current = null
        }
    }, [coordInicio, coordFinal, coordCliente])

    return <div ref={contenedor} className="h-56 w-full rounded-md" />
}
