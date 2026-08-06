import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import AccionesExternas from './AccionesExternas'
import { APPS_EXTERNAS } from '@/lib/appsExternas'
import type { IVisitClientCard } from '@/types/planificacion'

const CLIENTE: IVisitClientCard = {
    codigoCliente: '900123',
    codigoParticularCliente: '12345',
    nombreCliente: 'KIOSCO RUBEN SRL',
}

describe('AccionesExternas', () => {
    // Lo que garantiza que la app número tres no requiera decisiones nuevas.
    it('renderiza un botón por app registrada', () => {
        render(<AccionesExternas cliente={CLIENTE} variante="fila" onAbrir={vi.fn()} />)
        for (const app of APPS_EXTERNAS) {
            expect(screen.getByRole('button', { name: app.label })).toBeInTheDocument()
        }
    })

    it('avisa qué app y qué cliente se abrieron', async () => {
        const onAbrir = vi.fn()
        render(<AccionesExternas cliente={CLIENTE} variante="fila" onAbrir={onAbrir} />)
        await userEvent.click(screen.getByRole('button', { name: 'Pagos' }))
        expect(onAbrir).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'pagos' }),
            CLIENTE,
        )
    })

    // La variante header comparte el lenguaje visual de las utilidades que ya viven
    // arriba de la card (Llamar / Reagendar): chip bajo de 32px, no botón de 44px.
    it('la variante header usa el alto de chip de las utilidades de la card', () => {
        render(<AccionesExternas cliente={CLIENTE} variante="header" onAbrir={vi.fn()} />)
        expect(screen.getByRole('button', { name: 'Pagos' }).className).toContain('h-8')
    })

    it('la variante fila usa el alto de acción táctil', () => {
        render(<AccionesExternas cliente={CLIENTE} variante="fila" onAbrir={vi.fn()} />)
        expect(screen.getByRole('button', { name: 'Pagos' }).className).toContain('h-11')
    })
})
