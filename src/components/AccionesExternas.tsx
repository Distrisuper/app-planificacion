import { ArrowUpRight } from 'lucide-react'
import { APPS_EXTERNAS, type AppExterna } from '@/lib/appsExternas'
import type { IVisitClientCard } from '@/types/planificacion'

// Borde fino sobre blanco (en vez del relleno gris de la fila de dirección) más la flecha
// al final le dan a estas acciones un vocabulario propio de "esto te saca de la app": así
// la card distingue de un vistazo qué controles actúan sobre la visita y qué controles
// navegan afuera. No unificar el estilo con los chips del ciclo — se pierde la distinción.
const CHIP_CONTEXTO =
    'inline-flex h-[30px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#E3E8F2] bg-white text-[11.5px] font-semibold text-[#54607A] hover:bg-[#F4F6FA]'
const BOTON_FILA =
    'inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#D8DEEA] bg-white text-[13px] font-semibold text-dsnavy hover:bg-dsnavy/5'

interface AccionesExternasProps {
    cliente: IVisitClientCard
    /** 'contexto' = banda de consulta debajo de la dirección de la card, misma especie que
     *  ella (abre un destino externo). 'fila' = botón táctil dentro de un sheet. */
    variante: 'fila' | 'contexto'
    onAbrir: (app: AppExterna, cliente: IVisitClientCard) => void
}

/** Único lugar donde se listan las apps externas para el usuario. Se renderiza en dos
 *  contextos (banda de la card y sheet del cliente) para que agregar una app no obligue
 *  a decidir de nuevo dónde va. */
export default function AccionesExternas({ cliente, variante, onAbrir }: AccionesExternasProps) {
    const contexto = variante === 'contexto'
    // `flex-1` reparte el ancho en partes iguales entre las apps registradas: con dos queda
    // una fila 50/50 y con tres se reparte en tercios, sin desbordar ni envolver.
    return (
        <div className={contexto ? 'mt-1.5 flex gap-1.5' : 'flex gap-1.5'}>
            {APPS_EXTERNAS.map(app => {
                const Icono = app.icon
                return (
                    <button
                        key={app.id}
                        type="button"
                        onClick={() => onAbrir(app, cliente)}
                        className={contexto ? CHIP_CONTEXTO : BOTON_FILA}
                    >
                        <Icono
                            className={contexto ? 'h-[13px] w-[13px]' : 'h-[14px] w-[14px]'}
                            strokeWidth={2}
                        />
                        {app.label}
                        {contexto && (
                            <ArrowUpRight
                                className="h-2.5 w-2.5 text-[#98A2B8]"
                                strokeWidth={2.4}
                            />
                        )}
                    </button>
                )
            })}
        </div>
    )
}
