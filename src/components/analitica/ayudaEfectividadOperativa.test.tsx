import { render, screen } from '@testing-library/react'
import { ayudaVisitasMensual } from './ayudaEfectividadOperativa'

// El umbral vive en `pl_criterio_visita` (api-vendedores) y llega por GET
// /analitica/criterio. Antes este texto estaba escrito a mano y este test era la red
// contra que se desincronizara; ahora el texto sale del criterio y el test verifica eso.
it('ayudaVisitasMensual cita el criterio que recibe, con su techo si lo tiene', () => {
    render(<>{ayudaVisitasMensual({ toleranciaMetros: 100, duracionMinMin: 10, duracionMaxMin: 90 })}</>)
    expect(screen.getByText(/a 100 m o menos del cliente/)).toBeInTheDocument()
    expect(screen.getByText(/duró entre 10 y 90 min/)).toBeInTheDocument()
})

it('ayudaVisitasMensual sin techo real no menciona un máximo', () => {
    render(<>{ayudaVisitasMensual({ toleranciaMetros: 100, duracionMinMin: 15, duracionMaxMin: 99_999 })}</>)
    expect(screen.getByText(/duró al menos 15 min/)).toBeInTheDocument()
    expect(screen.queryByText(/99/)).not.toBeInTheDocument()
})

it('ayudaVisitasMensual sin criterio (cargando) no inventa números', () => {
    render(<>{ayudaVisitasMensual(undefined)}</>)
    expect(screen.getByText(/que fija el criterio de validez/)).toBeInTheDocument()
})
