import EncabezadoAnalitica from '@/components/analitica/EncabezadoAnalitica'
import EfectividadOperativaSection from '@/components/analitica/EfectividadOperativaSection'

export default function AnaliticaPage() {
    return (
        <div className="min-h-screen bg-slate-50">
            <EncabezadoAnalitica />

            <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
                <EfectividadOperativaSection />
            </main>
        </div>
    )
}
