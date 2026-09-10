import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useDraggable } from '@dnd-kit/core'
import ClienteCardRuta from './ClienteCardRuta'
import type { IAgendaClientAdmin } from '@/types/planificacion'

// Real por default (el resto de los tests depende de su comportamiento real, sin
// DndContext); solo se sobreescribe puntualmente para espiar el listener de drag.
vi.mock('@dnd-kit/core', async () => {
    const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core')
    return { ...actual, useDraggable: vi.fn(actual.useDraggable) }
})

const CLIENTE = {
    rotacionClienteId: 11,
    codigoCliente: 'C001',
    codigoParticularCliente: 'P001',
    nombreCliente: 'KIOSCO DON JUAN',
    dia: 1,
    estado: 'pendiente',
    visitaId: null,
    ofrecimientosPendientes: 0,
    ultimoMovimiento: null,
    eliminado: false,
} as unknown as IAgendaClientAdmin

describe('ClienteCardRuta', () => {
    it('muestra el nombre en title case y el código particular', () => {
        render(<ClienteCardRuta cliente={CLIENTE} />)
        expect(screen.getByText('Kiosco Don Juan')).toBeInTheDocument()
        expect(screen.getByText('P001')).toBeInTheDocument()
    })

    it('sin movimientos no muestra autoría', () => {
        render(<ClienteCardRuta cliente={CLIENTE} />)
        expect(screen.queryByTitle(/movió/i)).not.toBeInTheDocument()
    })

    it('muestra quién movió la fila y cuándo, en hora de negocio', () => {
        render(
            <ClienteCardRuta
                cliente={{
                    ...CLIENTE,
                    ultimoMovimiento: {
                        origen: 'gerencia',
                        usuario: 'jefa@distrisuper.com',
                        fecha: '2026-08-11T14:05:00.000Z',
                    },
                }}
            />,
        )
        expect(
            screen.getByTitle('Movió gerencia (jefa@distrisuper.com) el 11/08 11:05'),
        ).toBeInTheDocument()
    })

    it('marca visualmente al cliente ya resuelto: no se puede mover', () => {
        render(<ClienteCardRuta cliente={{ ...CLIENTE, estado: 'visitada' }} />)
        expect(screen.getByTestId('card-cliente-11')).toHaveAttribute(
            'data-resuelto',
            'true',
        )
    })

    it('muestra "Quitar de esta vuelta" solo si está pendiente y hay callback', () => {
        const onQuitar = () => {}
        const { rerender } = render(
            <ClienteCardRuta cliente={CLIENTE} onQuitar={onQuitar} />,
        )
        expect(
            screen.getByRole('button', { name: /quitar de esta vuelta/i }),
        ).toBeInTheDocument()

        rerender(<ClienteCardRuta cliente={CLIENTE} />)
        expect(
            screen.queryByRole('button', { name: /quitar de esta vuelta/i }),
        ).not.toBeInTheDocument()
    })

    it('no ofrece quitar una card en_curso: bloquearía con VISITA_EN_CURSO', () => {
        render(
            <ClienteCardRuta
                cliente={{ ...CLIENTE, estado: 'en_curso' }}
                onQuitar={() => {}}
            />,
        )
        expect(
            screen.queryByRole('button', { name: /quitar de esta vuelta/i }),
        ).not.toBeInTheDocument()
    })

    it('confirma antes de quitar, y llama a onQuitar solo si se confirma', () => {
        const onQuitar = vi.fn()
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        render(<ClienteCardRuta cliente={CLIENTE} onQuitar={onQuitar} />)

        screen.getByRole('button', { name: /quitar de esta vuelta/i }).click()

        expect(onQuitar).toHaveBeenCalledWith(11)
    })

    it('no quita si se cancela la confirmación', () => {
        const onQuitar = vi.fn()
        vi.spyOn(window, 'confirm').mockReturnValue(false)
        render(<ClienteCardRuta cliente={CLIENTE} onQuitar={onQuitar} />)

        screen.getByRole('button', { name: /quitar de esta vuelta/i }).click()

        expect(onQuitar).not.toHaveBeenCalled()
    })

    it('corta la propagación del pointerdown para no arrancar un drag del card', () => {
        // El botón vive DENTRO del div arrastrable: si el pointerdown burbujea, el
        // listener de dnd-kit (enganchado en el div vía `{...listeners}`) lo toma como
        // el inicio de un arrastre y el click de "quitar" nunca se dispara — es
        // exactamente el bug reportado en producción. Se espía el listener real de
        // dnd-kit (no uno agregado a mano) para probar la propagación tal como React
        // la maneja de verdad entre dos props onPointerDown.
        const onPointerDownDelDrag = vi.fn()
        vi.mocked(useDraggable).mockReturnValueOnce({
            attributes: {},
            listeners: { onPointerDown: onPointerDownDelDrag },
            setNodeRef: () => {},
            transform: null,
            isDragging: false,
        } as unknown as ReturnType<typeof useDraggable>)

        render(<ClienteCardRuta cliente={CLIENTE} onQuitar={() => {}} />)
        fireEvent.pointerDown(screen.getByRole('button', { name: /quitar de esta vuelta/i }))

        expect(onPointerDownDelDrag).not.toHaveBeenCalled()
    })

    it('una card eliminada se muestra deshabilitada, sin drag y sin "Quitar"', () => {
        render(
            <ClienteCardRuta
                cliente={{ ...CLIENTE, eliminado: true }}
                onQuitar={() => {}}
                onRestaurar={() => {}}
            />,
        )

        expect(screen.getByTestId('card-cliente-11')).toHaveAttribute(
            'data-eliminado',
            'true',
        )
        expect(
            screen.queryByRole('button', { name: /quitar de esta vuelta/i }),
        ).not.toBeInTheDocument()
    })

    it('una card eliminada no es arrastrable (useDraggable recibe disabled: true)', () => {
        render(
            <ClienteCardRuta
                cliente={{ ...CLIENTE, eliminado: true }}
                onRestaurar={() => {}}
            />,
        )

        const llamada = vi.mocked(useDraggable).mock.calls.at(-1)?.[0]
        expect(llamada).toMatchObject({ disabled: true })
    })

    it('muestra "Restaurar" solo si está eliminada y hay callback', () => {
        const { rerender } = render(
            <ClienteCardRuta cliente={{ ...CLIENTE, eliminado: true }} onRestaurar={() => {}} />,
        )
        expect(
            screen.getByRole('button', { name: /restaurar/i }),
        ).toBeInTheDocument()

        rerender(<ClienteCardRuta cliente={{ ...CLIENTE, eliminado: true }} />)
        expect(screen.queryByRole('button', { name: /restaurar/i })).not.toBeInTheDocument()

        rerender(<ClienteCardRuta cliente={CLIENTE} onRestaurar={() => {}} />)
        expect(screen.queryByRole('button', { name: /restaurar/i })).not.toBeInTheDocument()
    })

    it('restaurar llama a onRestaurar sin pedir confirmación', () => {
        const onRestaurar = vi.fn()
        // vi.spyOn reutiliza el mismo spy si window.confirm ya está espiado por un test
        // anterior (acá, los de "quitar"): sin este mockClear(), su historial de llamadas
        // viejas contamina el "not.toHaveBeenCalled()" de abajo.
        const confirmSpy = vi.spyOn(window, 'confirm')
        confirmSpy.mockClear()
        render(
            <ClienteCardRuta cliente={{ ...CLIENTE, eliminado: true }} onRestaurar={onRestaurar} />,
        )

        screen.getByRole('button', { name: /restaurar/i }).click()

        expect(onRestaurar).toHaveBeenCalledWith(11)
        expect(confirmSpy).not.toHaveBeenCalled()
    })

    it('corta la propagación del pointerdown en el botón de restaurar', () => {
        const onPointerDownDelDrag = vi.fn()
        vi.mocked(useDraggable).mockReturnValueOnce({
            attributes: {},
            listeners: { onPointerDown: onPointerDownDelDrag },
            setNodeRef: () => {},
            transform: null,
            isDragging: false,
        } as unknown as ReturnType<typeof useDraggable>)

        render(
            <ClienteCardRuta cliente={{ ...CLIENTE, eliminado: true }} onRestaurar={() => {}} />,
        )
        fireEvent.pointerDown(screen.getByRole('button', { name: /restaurar/i }))

        expect(onPointerDownDelDrag).not.toHaveBeenCalled()
    })
})
