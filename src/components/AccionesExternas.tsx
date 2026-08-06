import { APPS_EXTERNAS, type AppExterna } from '@/lib/appsExternas'
import type { IVisitClientCard } from '@/types/planificacion'

// La variante 'header' replica el chip de las utilidades de ClienteCard (Llamar /
// Reagendar). Se duplica el string en vez de importarlo de ClienteCard para no invertir
// la dependencia entre componentes hermanos; si alguna vez son tres los que lo usan,
// el constante se muda a src/lib.
const CHIP_HEADER =
    'inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg bg-[#F4F6FA] px-2.5 text-[11.5px] font-semibold text-[#54607A] hover:bg-[#EAEEF6]'
const BOTON_FILA =
    'inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#D8DEEA] bg-white text-[13px] font-semibold text-dsnavy hover:bg-dsnavy/5'

interface AccionesExternasProps {
    cliente: IVisitClientCard
    /** 'header' = chip bajo entre las utilidades de la card (no suma altura a la card).
     *  'fila' = botón táctil dentro de un sheet, donde hay espacio. */
    variante: 'fila' | 'header'
    onAbrir: (app: AppExterna, cliente: IVisitClientCard) => void
}

/** Único lugar donde se listan las apps externas para el usuario. Se renderiza en dos
 *  contextos (header de la card y sheet del cliente) para que agregar una app no obligue
 *  a decidir de nuevo dónde va. */
export default function AccionesExternas({ cliente, variante, onAbrir }: AccionesExternasProps) {
    const header = variante === 'header'
    return (
        <div className={header ? 'flex gap-1' : 'flex gap-1.5'}>
            {APPS_EXTERNAS.map(app => {
                const Icono = app.icon
                return (
                    <button
                        key={app.id}
                        type="button"
                        onClick={() => onAbrir(app, cliente)}
                        className={header ? CHIP_HEADER : BOTON_FILA}
                    >
                        <Icono
                            className={header ? 'h-[13px] w-[13px]' : 'h-[14px] w-[14px]'}
                            strokeWidth={2}
                        />
                        {app.label}
                    </button>
                )
            })}
        </div>
    )
}
