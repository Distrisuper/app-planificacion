import { useState } from 'react'
import { capturarUbicacion, type GeoResult } from '@/lib/geolocation'

/** Hook wrapper: expone `capture()` + el último resultado + estado de carga. */
export function useGeolocation() {
    const [resultado, setResultado] = useState<GeoResult | null>(null)
    const [capturing, setCapturing] = useState(false)

    async function capture(): Promise<GeoResult> {
        setCapturing(true)
        const r = await capturarUbicacion()
        setResultado(r)
        setCapturing(false)
        return r
    }

    return { resultado, capturing, capture }
}
