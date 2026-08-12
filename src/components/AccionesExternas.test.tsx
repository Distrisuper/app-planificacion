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

    // La variante contexto es una banda de consulta dentro de la card: chip bajo de 30px,
    // no botón táctil de 44px como en el sheet.
    it('la variante contexto usa el alto de chip de la banda de la card', () => {
        render(<AccionesExternas cliente={CLIENTE} variante="contexto" onAbrir={vi.fn()} />)
        expect(screen.getByRole('button', { name: 'Pagos' }).className).toContain('h-[30px]')
    })

    // La flecha es lo que marca que el chip te saca de la app. Se cuenta el segundo svg
    // (ícono de la app + flecha): si alguien la saca, queda uno solo y el test rompe.
    it('la variante contexto marca el destino externo con una flecha', () => {
        render(<AccionesExternas cliente={CLIENTE} variante="contexto" onAbrir={vi.fn()} />)
        const chip = screen.getByRole('button', { name: 'Pagos' })
        expect(chip.querySelectorAll('svg')).toHaveLength(2)

        // En 'fila' no va: dentro del sheet ya se entiende que el destino es otra app.
        render(<AccionesExternas cliente={CLIENTE} variante="fila" onAbrir={vi.fn()} />)
        const enFila = screen.getAllByRole('button', { name: 'Pagos' })[1]
        expect(enFila.querySelectorAll('svg')).toHaveLength(1)
    })

    it('la variante fila usa el alto compacto del pie del sheet', () => {
        render(<AccionesExternas cliente={CLIENTE} variante="fila" onAbrir={vi.fn()} />)
        expect(screen.getByRole('button', { name: 'Pagos' }).className).toContain('h-9')
    })
})
