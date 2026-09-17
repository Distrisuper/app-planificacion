import { useEffect, useState } from 'react'
import BottomSheet from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/button'
import { useCrearAlta, useEditarAlta, useReintentarAlta } from '@/hooks/useAltas'
import { diaLabel } from './buscador/etiquetas'
import type { NotificacionTipo } from '@/components/ui/Notification'
import type { IAgendaClient, IEditarAltaDTO } from '@/types/planificacion'

export type ModoClienteNuevo =
    | { modo: 'crear'; semana: number; dia: number }
    | { modo: 'editar'; cliente: IAgendaClient }
    | { modo: 'reintentar'; cliente: IAgendaClient; diaSugerido: number }

interface ClienteNuevoSheetProps {
    open: boolean
    contexto: ModoClienteNuevo | null
    onClose: () => void
    onListo: (cliente: IAgendaClient, contexto: ModoClienteNuevo) => void
    onAviso: (tipo: NotificacionTipo, mensaje: string) => void
}

const DIAS = [1, 2, 3, 4, 5]
const INPUT = 'w-full rounded-[11px] border-[1.5px] border-[#E4E8F0] px-3 py-2.5 text-sm font-semibold text-[#182645] outline-none placeholder:font-medium placeholder:text-[#8A93A6] focus:border-dsnavy'
const LABEL = 'mb-1 block text-[9.5px] font-bold uppercase tracking-wide text-dsmuted'

/**
 * "Cliente nuevo" (spec 2026-09-17): el comercio que todavía no es cliente. Tres modos
 * sobre el mismo formulario: crear la cita (nombre obligatorio, día elegible), editar los
 * datos del comercio mientras la fila está pendiente o la visita abierta, y volver a
 * agendar después de un "No visité" (solo el día: los datos viajan copiados del backend).
 * Vocabulario del vendedor: nunca "alta" ni "prospecto".
 */
export default function ClienteNuevoSheet({ open, contexto, onClose, onListo, onAviso }: ClienteNuevoSheetProps) {
    const crear = useCrearAlta()
    const editar = useEditarAlta()
    const reintentar = useReintentarAlta()
    const [nombre, setNombre] = useState('')
    const [razonSocial, setRazonSocial] = useState('')
    const [direccion, setDireccion] = useState('')
    const [dia, setDia] = useState(1)

    useEffect(() => {
        if (!open || !contexto) return
        if (contexto.modo === 'crear') {
            setNombre(''); setRazonSocial(''); setDireccion(''); setDia(contexto.dia)
        } else if (contexto.modo === 'editar') {
            const d = contexto.cliente.detalleAlta
            setNombre(d?.nombre ?? contexto.cliente.nombreCliente)
            setRazonSocial(d?.razonSocial ?? '')
            setDireccion(d?.direccion ?? '')
        } else {
            setDia(contexto.diaSugerido)
        }
    }, [open, contexto])

    if (!contexto) return null
    const trabajando = crear.isPending || editar.isPending || reintentar.isPending
    const nombreLimpio = nombre.trim()

    async function confirmar() {
        if (!contexto) return
        try {
            let cliente: IAgendaClient
            if (contexto.modo === 'crear') {
                cliente = await crear.mutateAsync({
                    semana: contexto.semana,
                    dia,
                    nombre: nombreLimpio,
                    razonSocial: razonSocial.trim() || undefined,
                    direccion: direccion.trim() || undefined,
                })
            } else if (contexto.modo === 'editar') {
                const d = contexto.cliente.detalleAlta
                const cambios: IEditarAltaDTO = {}
                if (nombreLimpio !== (d?.nombre ?? '')) cambios.nombre = nombreLimpio
                if ((razonSocial.trim() || null) !== (d?.razonSocial ?? null)) cambios.razonSocial = razonSocial.trim() || null
                if ((direccion.trim() || null) !== (d?.direccion ?? null)) cambios.direccion = direccion.trim() || null
                cliente = await editar.mutateAsync({ rotacionClienteId: contexto.cliente.rotacionClienteId, dto: cambios })
            } else {
                cliente = await reintentar.mutateAsync({ rotacionClienteId: contexto.cliente.rotacionClienteId, dia })
            }
            onListo(cliente, contexto)
            onClose()
        } catch {
            onAviso('error', 'No se pudo guardar el cliente nuevo. Volvé a intentar.')
        }
    }

    const titulo = contexto.modo === 'crear' ? 'Cliente nuevo' : contexto.cliente.nombreCliente
    const eyebrow = contexto.modo === 'crear' ? `Agregar al ${diaLabel(contexto.dia)}` : contexto.modo === 'editar' ? 'Cliente nuevo · editar datos' : 'Cliente nuevo · volver a agendar'
    const labelBoton =
        contexto.modo === 'crear' ? `Agregar al ${diaLabel(dia)}`
        : contexto.modo === 'editar' ? 'Guardar'
        : `Volver a agendar el ${diaLabel(dia)}`
    const deshabilitado = trabajando || (contexto.modo !== 'reintentar' && nombreLimpio === '')

    return (
        <BottomSheet open={open} onClose={onClose} eyebrow={eyebrow} title={titulo} altura="auto"
            footer={
                <Button onClick={confirmar} disabled={deshabilitado} loading={trabajando} className="h-12 w-full bg-dsgreen text-[14.5px] hover:bg-dsgreen/90">
                    {labelBoton}
                </Button>
            }
        >
            <div className="flex flex-col gap-3">
                {contexto.modo !== 'reintentar' && (
                    <>
                        <div>
                            <label htmlFor="cn-nombre" className={LABEL}>Nombre del comercio</label>
                            <input id="cn-nombre" className={INPUT} maxLength={120} value={nombre} onChange={e => setNombre(e.target.value)} autoFocus placeholder="Cómo se llama el local" />
                        </div>
                        <div>
                            <label htmlFor="cn-razon" className={LABEL}>Razón social (opcional)</label>
                            <input id="cn-razon" className={INPUT} maxLength={120} value={razonSocial} onChange={e => setRazonSocial(e.target.value)} />
                        </div>
                        <div>
                            <label htmlFor="cn-direccion" className={LABEL}>Dirección (opcional)</label>
                            <input id="cn-direccion" className={INPUT} maxLength={200} value={direccion} onChange={e => setDireccion(e.target.value)} />
                        </div>
                    </>
                )}
                {contexto.modo !== 'editar' && (
                    <div>
                        <span className={LABEL}>Día</span>
                        <div className="flex gap-1.5">
                            {DIAS.map(d => (
                                <button key={d} type="button" onClick={() => setDia(d)}
                                    className={`h-9 flex-1 rounded-lg text-[12.5px] font-semibold ${d === dia ? 'bg-dsnavy text-white' : 'border-[1.5px] border-[#E1E6F0] text-[#182645]'}`}>
                                    {diaLabel(d)}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </BottomSheet>
    )
}
