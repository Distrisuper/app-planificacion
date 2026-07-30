import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { IAnaliticaFiltro } from '@/types/analitica'

export interface VendedorOpcion {
    codigo: string
    nombre: string
}

interface FiltrosAnaliticaProps {
    filtro: IAnaliticaFiltro
    vendedoresDisponibles: VendedorOpcion[]
    onRango: (desde: string, hasta: string) => void
    onToggleVendedor: (codigo: string) => void
    onLimpiar: () => void
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

function estaSemana() {
    const hoy = new Date()
    const diaSemana = hoy.getDay() === 0 ? 7 : hoy.getDay()
    const lunes = new Date(hoy)
    lunes.setDate(hoy.getDate() - (diaSemana - 1))
    const viernes = new Date(lunes)
    viernes.setDate(lunes.getDate() + 4)
    return [iso(lunes), iso(viernes)] as const
}

function esteMes() {
    const hoy = new Date()
    const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
    return [iso(primero), iso(ultimo)] as const
}

function mesPasado() {
    const hoy = new Date()
    const primero = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
    const ultimo = new Date(hoy.getFullYear(), hoy.getMonth(), 0)
    return [iso(primero), iso(ultimo)] as const
}

export default function FiltrosAnalitica({
    filtro,
    vendedoresDisponibles,
    onRango,
    onToggleVendedor,
    onLimpiar,
}: FiltrosAnaliticaProps) {
    const [abierto, setAbierto] = useState(false)
    const elegidos = filtro.vendedores ?? []
    const etiqueta = elegidos.length === 0 ? 'Todos' : `${elegidos.length} vendedores`

    return (
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-white px-6 py-4">
            <label className="flex flex-col text-xs font-medium text-slate-500">
                Desde
                <input
                    type="date"
                    aria-label="Desde"
                    value={filtro.desde}
                    onChange={e => onRango(e.target.value, filtro.hasta)}
                    className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                />
            </label>
            <label className="flex flex-col text-xs font-medium text-slate-500">
                Hasta
                <input
                    type="date"
                    aria-label="Hasta"
                    value={filtro.hasta}
                    onChange={e => onRango(filtro.desde, e.target.value)}
                    className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                />
            </label>

            <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => onRango(...estaSemana())}>
                    Esta semana
                </Button>
                <Button variant="outline" size="sm" onClick={() => onRango(...esteMes())}>
                    Este mes
                </Button>
                <Button variant="outline" size="sm" onClick={() => onRango(...mesPasado())}>
                    Mes pasado
                </Button>
            </div>

            <div className="relative">
                <Button variant="outline" size="sm" onClick={() => setAbierto(a => !a)}>
                    Vendedores: {etiqueta}
                    <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
                {abierto && (
                    <div className="absolute z-20 mt-1 max-h-72 w-64 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                        <button
                            type="button"
                            onClick={onLimpiar}
                            className="mb-1 w-full rounded px-2 py-1 text-left text-xs text-slate-500 hover:bg-slate-50"
                        >
                            Ver todos
                        </button>
                        {vendedoresDisponibles.map(v => (
                            <label
                                key={v.codigo}
                                className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50"
                            >
                                <input
                                    type="checkbox"
                                    aria-label={v.nombre}
                                    checked={elegidos.includes(v.codigo)}
                                    onChange={() => onToggleVendedor(v.codigo)}
                                />
                                {v.nombre}
                            </label>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
