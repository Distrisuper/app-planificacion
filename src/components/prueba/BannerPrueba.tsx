import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { estaProbando, supervisa } from '@/lib/roles'
import CarteraDialog from './CarteraDialog'

/** Alto fijo del banner: la página que lo monta se corre esto hacia abajo. */
export const ALTO_BANNER_PRUEBA = 36

/**
 * La franja que dice en qué está parado el usuario. Es lo que resuelve la confusión que
 * motivó descartar un staging: una sola app, y lo que se está mirando se lee sin pensar.
 *
 * `fixed` y z-[55]: por encima del BottomSheet (z-50, así también se ve con la visita o el
 * mapa abiertos) y por debajo del ConfirmDialog (z-[60]) y la Notification (z-[70]).
 * Ámbar (color de "atención" del semáforo), nunca rojo: rojo es `alejado`.
 */
export default function BannerPrueba() {
    const { capacidades, vendedorDePrueba } = useAuth()
    const [eligiendo, setEligiendo] = useState(false)
    if (!estaProbando(capacidades)) return null

    const partes = ['Modo prueba', vendedorDePrueba?.descripcion, 'nada de esto cuenta ni llega a Cromo']
    const texto = partes.filter(Boolean).join(' · ')

    return (
        <>
            <div
                role="status"
                style={{ height: ALTO_BANNER_PRUEBA }}
                className="fixed inset-x-0 top-0 z-[55] flex items-center justify-between gap-2 bg-[#FDE68A] px-3 text-[12px] font-bold text-[#78350F]"
            >
                <span className="truncate">{texto}</span>
                <span className="flex shrink-0 items-center gap-3">
                    <button type="button" onClick={() => setEligiendo(true)} className="underline">
                        Reiniciar
                    </button>
                    {supervisa(capacidades) && (
                        <Link to="/analitica" className="underline">
                            Volver a analítica
                        </Link>
                    )}
                </span>
            </div>
            <CarteraDialog open={eligiendo} onOpenChange={setEligiendo} onReiniciado={() => setEligiendo(false)} />
        </>
    )
}
