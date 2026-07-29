import { useEffect, useState } from 'react'
import { segundosTranscurridos } from '@/lib/visitaTimer'

/** Segundos transcurridos desde que se marcó el inicio de la visita, actualizado cada segundo. */
export function useVisitaTimer(visitaId: number): number {
    const [segundos, setSegundos] = useState(() => segundosTranscurridos(visitaId) ?? 0)

    useEffect(() => {
        setSegundos(segundosTranscurridos(visitaId) ?? 0)
        const id = setInterval(() => setSegundos(segundosTranscurridos(visitaId) ?? 0), 1000)
        return () => clearInterval(id)
    }, [visitaId])

    return segundos
}
