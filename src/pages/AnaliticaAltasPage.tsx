import { useState } from 'react'
import FiltrosAnalitica from '@/components/analitica/FiltrosAnalitica'
import AnaliticaTabs from '@/components/analitica/AnaliticaTabs'
import TablaAltas from '@/components/analitica/TablaAltas'
import DetalleAltaPanel from '@/components/analitica/DetalleAltaPanel'
import AccountMenu from '@/components/AccountMenu'
import { Button } from '@/components/ui/button'
import { useAccionesDeCuenta } from '@/hooks/useAccionesDeCuenta'
import { useAuth } from '@/context/AuthContext'
import { useFiltroAnalitica } from '@/hooks/useFiltroAnalitica'
import { useAltasRelevadas, useVendedores } from '@/hooks/useAnalitica'
import { useEsquemaAlta } from '@/hooks/useEsquemaAlta'
import { aCsv, descargarCsv } from '@/lib/csv'
import { filasCsvAltas, nombreArchivoAltas } from '@/lib/altasCsv'
import type { IAltaRelevada } from '@/types/analitica'

/**
 * Relevamiento de los clientes nuevos para administración (spec 2026-09-21): qué cargó cada
 * vendedor en "Datos del comercio", y el CSV para tenerlo al lado del ERP. Los filtros son
 * los mismos de /analitica (rango + vendedores). El CSV se arma en el front desde el mismo
 * payload filtrado, recorriendo el esquema: un campo nuevo en la API aparece solo.
 */
export default function AnaliticaAltasPage() {
    const { user, logout } = useAuth()
    const accionesDeCuenta = useAccionesDeCuenta()
    const { filtro, setRango, toggleVendedor, limpiarVendedores } = useFiltroAnalitica()
    const [elegida, setElegida] = useState<IAltaRelevada | null>(null)

    const { data: roster } = useVendedores()
    const esquema = useEsquemaAlta()
    const { data: altas, isLoading, isError } = useAltasRelevadas(filtro)

    const opciones = (roster ?? []).map(v => ({ codigo: v.codigoParticularVendedor, nombre: v.nombreVendedor }))
    const listo = esquema.data && altas

    function exportar() {
        if (!esquema.data || !altas) return
        descargarCsv(nombreArchivoAltas(new Date()), aCsv(filasCsvAltas(esquema.data, altas)))
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="flex items-center justify-between gap-4 bg-white px-6 pt-4">
                <div className="flex-1"><AnaliticaTabs /></div>
                <AccountMenu nombre={user?.name ?? ''} onLogout={logout} acciones={accionesDeCuenta} />
            </header>

            <FiltrosAnalitica filtro={filtro} vendedoresDisponibles={opciones}
                onRango={setRango} onToggleVendedor={toggleVendedor} onLimpiar={limpiarVendedores} />

            <main className="mx-auto max-w-7xl space-y-4 px-6 py-6">
                <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-600">
                        {altas ? `${altas.length} cliente${altas.length === 1 ? '' : 's'} nuevo${altas.length === 1 ? '' : 's'}` : ''}
                    </p>
                    <Button variant="outline" onClick={exportar} disabled={!listo || altas.length === 0}>
                        Exportar CSV
                    </Button>
                </div>

                {(isLoading || esquema.isPending) && <p className="text-sm text-slate-500">Cargando…</p>}
                {(isError || esquema.isError) && <p className="text-sm text-red-600">No se pudieron cargar los clientes nuevos.</p>}

                {listo && altas.length === 0 && (
                    <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-600">
                        Sin clientes nuevos entre {filtro.desde} y {filtro.hasta}.
                    </div>
                )}

                {listo && altas.length > 0 && <TablaAltas filas={altas} esquema={esquema.data} onElegir={setElegida} />}

                {elegida && esquema.data && (
                    <DetalleAltaPanel alta={elegida} esquema={esquema.data} onCerrar={() => setElegida(null)} />
                )}
            </main>
        </div>
    )
}
