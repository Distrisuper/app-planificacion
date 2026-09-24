import { useEffect, useState } from 'react'
import { Loader2, WifiOff } from 'lucide-react'
import BottomSheet from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/button'
import { useEsquemaAlta } from '@/hooks/useEsquemaAlta'
import { useEditarAlta } from '@/hooks/useAltas'
import {
    camposPorSeccion, diffDetalle, estadoInicial, faltantesObligatorios, normalizarValor, opcionesDeCatalogo,
} from '@/lib/camposAlta'
import type { NotificacionTipo } from '@/components/ui/Notification'
import type { IAgendaClient, ICampoAlta, IEsquemaAlta } from '@/types/planificacion'

interface RelevamientoSheetProps {
    open: boolean
    cliente: IAgendaClient | null
    onClose: () => void
    onGuardado: (cliente: IAgendaClient) => void
    onAviso: (tipo: NotificacionTipo, mensaje: string) => void
}

const INPUT = 'w-full rounded-[11px] border-[1.5px] border-[#E4E8F0] bg-white px-3 py-2.5 text-sm font-semibold text-[#182645] outline-none placeholder:font-medium placeholder:text-[#8A93A6] focus:border-dsnavy disabled:bg-[#F1F4F9] disabled:text-[#8A93A6]'
const LABEL = 'mb-1 block text-[9.5px] font-bold uppercase tracking-wide text-dsmuted'
const SECCION = 'text-[9.5px] font-bold uppercase tracking-wide text-dsmuted'

/**
 * "Datos del comercio" (spec 2026-09-21): lo que administración necesita para dar de alta al
 * cliente nuevo en el ERP, cargado por el vendedor parado en el local. Se puede guardar a medias
 * (sólo el nombre no se vacía nunca), pero lo `obligatorio` traba el cierre de la visita. Se
 * guarda en `pl_rotacion_cliente.detalle` con un PUT explícito, solo el diff.
 *
 * El formulario es GENÉRICO: dibuja lo que trae GET /altas/esquema (secciones, campos,
 * catálogos). Acá no hay ninguna clave escrita por su nombre — agregar un dato al relevamiento
 * es un cambio en la API, no en este archivo. Lo único que este componente sabe es cómo se
 * dibuja cada TIPO de campo (`CampoInput`).
 *
 * Vocabulario del vendedor: "Datos del comercio", nunca "relevamiento" ni "alta".
 */
export default function RelevamientoSheet({ open, cliente, onClose, onGuardado, onAviso }: RelevamientoSheetProps) {
    const esquema = useEsquemaAlta(open)
    const editar = useEditarAlta()
    const [valores, setValores] = useState<Record<string, string>>({})

    // Se precarga al abrir y cuando llega el esquema; no en cada render — lo tipeado no se pisa.
    useEffect(() => {
        if (!open || !cliente || !esquema.data) return
        setValores(estadoInicial(esquema.data.campos, cliente.detalleAlta, cliente.nombreCliente))
    }, [open, cliente, esquema.data])

    if (!cliente) return null

    const campos = esquema.data?.campos ?? []
    const faltan = faltantesObligatorios(campos, valores, esquema.data?.catalogos ?? null).length
    const nombreCampo = campos.find(c => c.requerido)
    const nombreVacio = nombreCampo ? normalizarValor(valores[nombreCampo.clave]) === null : false
    const trabajando = editar.isPending

    async function guardar() {
        if (!cliente || !esquema.data) return
        const dto = diffDetalle(esquema.data.campos, cliente.detalleAlta, valores, cliente.nombreCliente)
        try {
            const actualizado = await editar.mutateAsync({ rotacionClienteId: cliente.rotacionClienteId, dto })
            onGuardado(actualizado)
            onClose()
        } catch {
            onAviso('error', 'No se pudieron guardar los datos. Volvé a intentar.')
        }
    }

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            eyebrow={
                !esquema.data
                    ? 'Cliente nuevo'
                    : faltan > 0
                      ? `Cliente nuevo · ${faltan === 1 ? 'falta 1 obligatorio' : `faltan ${faltan} obligatorios`}`
                      : 'Cliente nuevo · datos completos'
            }
            title="Datos del comercio"
            subtitle={cliente.nombreCliente}
            altura="completa"
            footer={
                esquema.data ? (
                    <Button onClick={guardar} disabled={trabajando || nombreVacio} loading={trabajando}
                        className="h-12 w-full bg-dsgreen text-[14.5px] hover:bg-dsgreen/90">
                        Guardar
                    </Button>
                ) : undefined
            }
        >
            {esquema.isPending && (
                <div className="flex justify-center py-10">
                    <Loader2 className="h-7 w-7 animate-spin text-dsnavy" strokeWidth={2.4} />
                </div>
            )}
            {esquema.isError && (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <WifiOff className="h-7 w-7 text-dsmuted" strokeWidth={2} />
                    <p className="text-sm font-semibold text-[#182645]">No se pudo cargar el formulario.</p>
                    <Button variant="outline" onClick={() => esquema.refetch()}>Volver a intentar</Button>
                </div>
            )}
            {esquema.data && (
                <div className="flex flex-col gap-5 pb-2">
                    {camposPorSeccion(esquema.data).map(({ seccion, campos: delGrupo }) => (
                        <section key={seccion.clave} className="flex flex-col gap-3">
                            <h3 className={SECCION}>{seccion.titulo}</h3>
                            {delGrupo.map(campo => (
                                <CampoInput
                                    key={campo.clave}
                                    campo={campo}
                                    catalogos={esquema.data!.catalogos}
                                    valor={valores[campo.clave] ?? ''}
                                    onChange={v => setValores(prev => ({ ...prev, [campo.clave]: v }))}
                                />
                            ))}
                        </section>
                    ))}
                </div>
            )}
        </BottomSheet>
    )
}

interface CampoInputProps {
    campo: ICampoAlta
    catalogos: IEsquemaAlta['catalogos']
    valor: string
    onChange: (v: string) => void
}

/** Un widget por TIPO de campo. Es la única tabla "tipo → cómo se dibuja" del front; un tipo
 *  nuevo en el esquema se agrega acá y en el validador de la API, en ningún otro lado. */
function CampoInput({ campo, catalogos, valor, onChange }: CampoInputProps) {
    const id = `rel-${campo.clave}`
    // "(opcional)" sólo en lo que de verdad lo es: lo `obligatorio` hay que cargarlo para
    // cerrar la visita, aunque el formulario se pueda guardar a medias.
    const etiqueta = campo.requerido || campo.obligatorio ? campo.etiqueta : `${campo.etiqueta} (opcional)`

    if (campo.tipo === 'catalogo') {
        const sinLista = catalogos === null
        const opciones = opcionesDeCatalogo(catalogos, campo.catalogo, normalizarValor(valor))
        // Un valor guardado que ya no figura en el catálogo entero (ni activo ni inactivo):
        // se agrega como opción con su código pelado para que el select no lo pierda.
        const huerfano = valor !== '' && !opciones.some(o => o.codigo === valor)
        return (
            <div>
                <label htmlFor={id} className={LABEL}>{etiqueta}</label>
                <select id={id} className={INPUT} value={valor} disabled={sinLista} onChange={e => onChange(e.target.value)}>
                    <option value="">{sinLista ? 'Lista no disponible' : 'Elegí una opción…'}</option>
                    {opciones.map(o => <option key={o.codigo} value={o.codigo}>{o.descripcion}</option>)}
                    {huerfano && <option value={valor}>{valor}</option>}
                </select>
            </div>
        )
    }

    if (campo.tipo === 'textoLargo') {
        return (
            <div>
                <div className="mb-1 flex items-baseline justify-between">
                    <label htmlFor={id} className={`${LABEL} mb-0`}>{etiqueta}</label>
                    {campo.max !== undefined && (
                        <span className="text-[10px] font-semibold text-dsmuted">{valor.length}/{campo.max}</span>
                    )}
                </div>
                <textarea id={id} rows={2} maxLength={campo.max} className={`${INPUT} resize-none`}
                    value={valor} placeholder={campo.placeholder} onChange={e => onChange(e.target.value)} />
            </div>
        )
    }

    const inputMode = campo.tipo === 'cuit' ? 'numeric' : campo.tipo === 'email' ? 'email' : undefined
    const type = campo.tipo === 'email' ? 'email' : 'text'
    return (
        <div>
            <label htmlFor={id} className={LABEL}>{etiqueta}</label>
            <input id={id} type={type} inputMode={inputMode} maxLength={campo.max} className={INPUT}
                value={valor} placeholder={campo.placeholder} onChange={e => onChange(e.target.value)} />
        </div>
    )
}
