import { render, screen } from '@testing-library/react'
import { AYUDA_VISITAS_MENSUAL } from './ayudaEfectividadOperativa'

// El umbral real vive en `pl_criterio_visita` (api-vendedores) y no se expone por API:
// este texto es hardcodeado y hay que actualizarlo a mano cada vez que cambie el criterio
// en la base. Este test es la única red que avisa si alguno de los dos se corrió y el otro
// quedó atrás — ver CLAUDE.md, sección del gate de 15 min vs. el umbral de validez.
it('AYUDA_VISITAS_MENSUAL dice 15 min, no 10: el criterio de validez subió junto con el gate de cierre', () => {
    render(<>{AYUDA_VISITAS_MENSUAL}</>)
    expect(screen.getByText(/duración de 15 a\s*90 min/)).toBeInTheDocument()
    expect(screen.queryByText(/duración de 10 a/)).not.toBeInTheDocument()
})
