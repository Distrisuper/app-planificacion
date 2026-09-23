import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isoLocal } from '@/lib/fechas'
import type { IAnaliticaFiltro } from '@/types/analitica'

/** Lunes a viernes de la semana en curso: el default con el que gerencia abre la app. */
function semanaEnCurso(): { desde: string; hasta: string } {
    const hoy = new Date()
    const diaSemana = hoy.getDay() === 0 ? 7 : hoy.getDay()
    const lunes = new Date(hoy)
    lunes.setDate(hoy.getDate() - (diaSemana - 1))
    const viernes = new Date(lunes)
    viernes.setDate(lunes.getDate() + 4)
    return { desde: isoLocal(lunes), hasta: isoLocal(viernes) }
}

export function useFiltroAnalitica(porDefectoRecibido?: { desde: string; hasta: string }) {
    const [params, setParams] = useSearchParams()
    // La analítica arranca en la semana; actividad arranca en hoy. El default es del
    // llamador, no del hook, porque es una decisión de pantalla.
    const calculado = useMemo(semanaEnCurso, [])
    const porDefecto = porDefectoRecibido ?? calculado

    const filtro: IAnaliticaFiltro = useMemo(() => {
        const vendedores = (params.get('vendedores') ?? '')
            .split(',')
            .map(v => v.trim())
            .filter(Boolean)
        return {
            desde: params.get('desde') ?? porDefecto.desde,
            hasta: params.get('hasta') ?? porDefecto.hasta,
            vendedores,
        }
    }, [params, porDefecto])

    /** Si el rango lo ELIGIÓ el usuario (está en la URL) o es el default del hook. Las tabs
     *  de actividad no distinguen —el default es un rango como cualquier otro—; "Datos del
     *  comercio" sí: sin rango elegido muestra todo lo acumulado. */
    const hayRango = params.has('desde')

    /** Toda escritura pasa por acá para que la URL siga siendo la única fuente de verdad.
     *  El rango se escribe sólo si viene en `cambios` o ya estaba en la URL: tocar los
     *  vendedores no puede convertir el default en una elección. */
    const escribir = useCallback(
        (cambios: Partial<{ desde: string; hasta: string; vendedores: string[] }>) => {
            const siguiente = new URLSearchParams(params)
            if (cambios.desde || cambios.hasta || params.has('desde')) {
                siguiente.set('desde', cambios.desde ?? filtro.desde)
                siguiente.set('hasta', cambios.hasta ?? filtro.hasta)
            }
            const vendedores = cambios.vendedores ?? filtro.vendedores ?? []
            if (vendedores.length > 0) siguiente.set('vendedores', vendedores.join(','))
            else siguiente.delete('vendedores')
            setParams(siguiente, { replace: true })
        },
        [params, setParams, filtro],
    )

    const setRango = useCallback(
        (desde: string, hasta: string) => escribir({ desde, hasta }),
        [escribir],
    )

    const toggleVendedor = useCallback(
        (codigo: string) => {
            const actuales = filtro.vendedores ?? []
            const vendedores = actuales.includes(codigo)
                ? actuales.filter(c => c !== codigo)
                : [...actuales, codigo]
            escribir({ vendedores })
        },
        [filtro, escribir],
    )

    const limpiarVendedores = useCallback(() => escribir({ vendedores: [] }), [escribir])

    /** Vuelve a "sin rango elegido": saca desde/hasta de la URL y deja los vendedores. */
    const limpiarRango = useCallback(() => {
        const siguiente = new URLSearchParams(params)
        siguiente.delete('desde')
        siguiente.delete('hasta')
        setParams(siguiente, { replace: true })
    }, [params, setParams])

    return { filtro, hayRango, setRango, toggleVendedor, limpiarVendedores, limpiarRango }
}
