import { ArrowUpRight } from 'lucide-react'
import { APPS_EXTERNAS, type AppExterna } from '@/lib/appsExternas'
import type { IVisitClientCard } from '@/types/planificacion'

// Misma especie visual que la fila de dirección (gris relleno): las tres son consultas
// del contexto del cliente que llevan afuera. El borde blanco queda reservado al tier 1,
// que opera la visita. La flecha ↗ es lo que marca el destino externo.
const CHIP_CONTEXTO =
    'inline-flex h-[30px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#F4F6FA] text-[11.5px] font-semibold text-dsmuted hover:bg-[#EAEEF6]'
// Ícono + label en una sola línea, plano, sin borde: el mismo lenguaje visual (y ahora el
// mismo layout compacto) que la barra de tabs de AppExternaSheet (ver TAB_ACTIVA/
// TAB_INACTIVA ahí). A propósito — este botón es lo último que se toca antes de que esa
// barra aparezca fija abajo, así que la transición se lee como "el mismo control se ancla
// al fondo", no como un control nuevo y distinto. Horizontal, no apilado: el apilado
// costaba ~70px de alto y dejaba muy poco lugar para la tabla de rubros arriba.
const BOTON_FILA =
    'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg text-dsnavy hover:bg-dsnavy/5'

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
                            className={contexto ? 'h-[13px] w-[13px]' : 'h-4 w-4'}
                            strokeWidth={2}
                        />
                        {contexto ? (
                            app.label
                        ) : (
                            <span className="text-[12px] font-extrabold uppercase tracking-wide">
                                {app.label}
                            </span>
                        )}
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
