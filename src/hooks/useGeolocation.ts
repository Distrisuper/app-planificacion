import { useState } from 'react'

/**
 * Captures ONE position as "lat,lng". Returns null if geolocation is
 * unavailable or the user denies permission — never rejects, so the visit
 * flow is never blocked by a location issue (spec §6/§10).
 */
export function getCurrentCoord(): Promise<string | null> {
    return new Promise(resolve => {
        if (!navigator.geolocation) {
            resolve(null)
            return
        }
        navigator.geolocation.getCurrentPosition(
            pos => resolve(`${pos.coords.latitude},${pos.coords.longitude}`),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
        )
    })
}

/** Hook wrapper: exposes a `capture()` action + the last captured coord + loading state. */
export function useGeolocation() {
    const [coord, setCoord] = useState<string | null>(null)
    const [capturing, setCapturing] = useState(false)

    async function capture(): Promise<string | null> {
        setCapturing(true)
        const c = await getCurrentCoord()
        setCoord(c)
        setCapturing(false)
        return c
    }

    return { coord, capturing, capture }
}
