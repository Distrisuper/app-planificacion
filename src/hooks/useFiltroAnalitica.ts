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

export function useFiltroAnalitica() {
    const [params, setParams] = useSearchParams()
    const porDefecto = useMemo(semanaEnCurso, [])

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

    /** Toda escritura pasa por acá para que la URL siga siendo la única fuente de verdad. */
    const escribir = useCallback(
        (cambios: Partial<{ desde: string; hasta: string; vendedores: string[] }>) => {
            const siguiente = new URLSearchParams(params)
            siguiente.set('desde', cambios.desde ?? filtro.desde)
            siguiente.set('hasta', cambios.hasta ?? filtro.hasta)
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

    return { filtro, setRango, toggleVendedor, limpiarVendedores }
}
