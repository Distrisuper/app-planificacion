import { useEffect, useState } from 'react'
import { useVisitaActiva } from '@/hooks/useVisitas'
import { fijarInicioVisita, segundosTranscurridos } from '@/lib/visitaTimer'

/**
 * Segundos transcurridos desde el inicio de la visita, actualizado cada segundo.
 *
 * El inicio lo manda el servidor (`GET /planificacion/visitas/activa`, `fechaInicio`).
 * Antes salía SOLO de `visita-inicio-<id>` en localStorage, y esa clave no sobrevive a
 * cerrar sesión, a un 401 por token vencido (`limpiarStorageSesion` borra todo `visita-*`)
 * ni a abrir la visita en otro dispositivo: la visita seguía abierta en el backend y el
 * cronómetro mostraba 00:00, arrancando de nuevo. El localStorage queda como caché del
 * ancla del servidor, para que una recarga sin señal siga contando bien.
 */
export function useVisitaTimer(visitaId: number): number {
    const { data: activa } = useVisitaActiva(visitaId)

    const [segundos, setSegundos] = useState(() => segundosTranscurridos(visitaId) ?? 0)

    useEffect(() => {
        // Solo si la activa del servidor es ESTA visita: con la agenda o el puntero local
        // desfasados, la de otra daría una duración ajena.
        if (activa && activa.id === visitaId) fijarInicioVisita(visitaId, activa.fechaInicio)
        setSegundos(segundosTranscurridos(visitaId) ?? 0)
        const id = setInterval(() => setSegundos(segundosTranscurridos(visitaId) ?? 0), 1000)
        return () => clearInterval(id)
    }, [visitaId, activa])

    return segundos
}
