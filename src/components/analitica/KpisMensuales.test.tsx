import { render, screen } from '@testing-library/react'
import KpisMensuales from './KpisMensuales'
import { MOCK_RESUMEN } from '@/mocks/analiticaMock'

it('muestra los tres KPIs del equipo con sus valores', () => {
    render(<KpisMensuales promedios={MOCK_RESUMEN.promedios} />)
    expect(screen.getByText('Efectividad operativa')).toBeInTheDocument()
    expect(screen.getByText('Visitas (mensual)')).toBeInTheDocument()
    expect(screen.getByText('Horas (mensual)')).toBeInTheDocument()
})

it('muestra s/d cuando ningún vendedor tiene objetivo vigente, nunca 0%', () => {
    render(
        <KpisMensuales
            promedios={{ ...MOCK_RESUMEN.promedios, efectividadOperativa: null }}
        />,
    )
    expect(screen.getByText('s/d')).toBeInTheDocument()
})
