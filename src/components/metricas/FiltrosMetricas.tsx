import type { IOpcionesMetricas } from '@/types/metricas'

export interface IValorFiltros {
    vendedor?: string
    sucursal?: string
    zona?: string
    localidad?: string
}

interface FiltrosMetricasProps {
    valor: IValorFiltros
    onCambiar: (v: IValorFiltros) => void
    vendedores: { codigo: string; nombre: string }[]
    opciones?: IOpcionesMetricas
}

const CLASE_SELECT =
    'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 sm:w-48'

function Select({ label, value, onChange, opciones, todas }: {
    label: string
    value?: string
    onChange: (v: string | undefined) => void
    opciones: { value: string; label: string }[]
    todas: string
}) {
    return (
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-500">
            {label}
            <select
                aria-label={label}
                value={value ?? ''}
                onChange={e => onChange(e.target.value || undefined)}
                className={CLASE_SELECT}
            >
                <option value="">{todas}</option>
                {opciones.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>
        </label>
    )
}

/** Vendedor · Sucursal · Zona · Localidad. Un filtro geográfico cambia QUÉ clientes entran,
 *  así que resetea al vendedor elegido (igual que el mockup): si no, se podría quedar
 *  mirando un vendedor que ya no tiene clientes en el recorte. */
export default function FiltrosMetricas({ valor, onCambiar, vendedores, opciones }: FiltrosMetricasProps) {
    const localidades = (opciones?.localidades ?? []).filter(l => !valor.zona || l.zona === valor.zona)

    return (
        <div className="flex flex-wrap gap-3">
            <Select
                label="Vendedor" todas="Equipo completo" value={valor.vendedor}
                opciones={vendedores.map(v => ({ value: v.codigo, label: v.nombre }))}
                onChange={vendedor => onCambiar({ ...valor, vendedor })}
            />
            <Select
                label="Sucursal" todas="Todas" value={valor.sucursal}
                opciones={(opciones?.sucursales ?? []).map(s => ({ value: s.codigo, label: s.descripcion }))}
                onChange={sucursal => onCambiar({ ...valor, sucursal, vendedor: undefined })}
            />
            <Select
                label="Zona" todas="Todas" value={valor.zona}
                opciones={(opciones?.zonas ?? []).map(z => ({ value: z.codigo, label: z.descripcion }))}
                onChange={zona => onCambiar({ ...valor, zona, localidad: undefined, vendedor: undefined })}
            />
            <Select
                label="Localidad" todas="Todas" value={valor.localidad}
                opciones={localidades.map(l => ({ value: l.localidad, label: l.localidad }))}
                onChange={localidad => onCambiar({ ...valor, localidad, vendedor: undefined })}
            />
        </div>
    )
}
