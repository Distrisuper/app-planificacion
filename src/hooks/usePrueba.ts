import { useMutation, useQueryClient } from '@tanstack/react-query'
import { reiniciarPrueba } from '@/api/planificacion'
import { useAuth } from '@/context/AuthContext'
import { limpiarVisitasLocales } from '@/lib/sesionLocal'

/**
 * Reinicia el vendedor de prueba del usuario. Invalida TODO (sin filtro de key): después de
 * borrar y volver a crear la rotación no queda ninguna query de planificación que siga siendo
 * válida, y enumerar keys acá es garantía de olvidarse una. Y refresca /me, que es de donde
 * el banner lee la descripción de la cartera.
 *
 * También suelta las anclas locales de visitas (`visita-en-curso`, borradores, cronómetro):
 * el backend acaba de borrar esas resoluciones, y el puntero sobrevivía al reinicio — la
 * barra "Visitando a…" quedaba apuntando a una visita inexistente, imposible de cerrar.
 */
export function useReiniciarPrueba() {
    const qc = useQueryClient()
    const { refrescarMe } = useAuth()
    return useMutation({
        mutationFn: (origen: string | null) => reiniciarPrueba(origen),
        onSuccess: async () => {
            limpiarVisitasLocales()
            await qc.invalidateQueries()
            await refrescarMe()
        },
    })
}
