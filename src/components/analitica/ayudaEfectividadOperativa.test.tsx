import { render, screen } from '@testing-library/react'
import { AYUDA_VISITAS_MENSUAL } from './ayudaEfectividadOperativa'

// El umbral real vive en `pl_criterio_visita` (api-vendedores) y no se expone por API:
// este texto es hardcodeado y hay que actualizarlo a mano cada vez que cambie el criterio
// en la base. Este test es la única red que avisa si el criterio se corrió y el texto
// quedó atrás — ver CLAUDE.md, sección del gate de 15 min vs. el umbral de validez.
it('AYUDA_VISITAS_MENSUAL dice "al menos 15 min", sin mencionar un techo', () => {
    render(<>{AYUDA_VISITAS_MENSUAL}</>)
    expect(screen.getByText(/duración de al menos 15 min/)).toBeInTheDocument()
    expect(screen.queryByText(/90 min/)).not.toBeInTheDocument()
    expect(screen.queryByText(/duración de 10 a/)).not.toBeInTheDocument()
})
