import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

    it('confirma antes de quitar, y llama a onQuitar solo si se confirma', async () => {
        const onQuitar = vi.fn()
        render(<ClienteCardRuta cliente={CLIENTE} onQuitar={onQuitar} />)

        await userEvent.click(screen.getByRole('button', { name: /quitar de esta vuelta/i }))
        // El click solo abre el diálogo: nada se quita hasta confirmar.
        expect(onQuitar).not.toHaveBeenCalled()
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Quitar' }))

        expect(onQuitar).toHaveBeenCalledWith(11)
    })

    it('no quita si se cancela la confirmación', async () => {
        const onQuitar = vi.fn()
        render(<ClienteCardRuta cliente={CLIENTE} onQuitar={onQuitar} />)

        await userEvent.click(screen.getByRole('button', { name: /quitar de esta vuelta/i }))
        await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

        expect(onQuitar).not.toHaveBeenCalled()
    })

    it('los controles de la card NO viven dentro de la superficie de arrastre', () => {
        // Esta es la única protección real contra que un click en un botón arranque un
        // arrastre, y por eso se verifica la ESTRUCTURA y no la propagación de un evento.
        //
        // La protección anterior era `stopPropagation` del pointerdown en cada botón, y
        // se rompió sola al cambiar los sensores: `MouseSensor`/`TouchSensor` escuchan
        // `onMouseDown`/`onTouchStart`, no `onPointerDown`, así que la guarda dejó de
        // guardar sin que ningún test fallara — los tests stubbeaban
        // `listeners: { onPointerDown }`, una forma que la config real ya no produce.
        // Con el bug presente, en Chromium: apretar el ✕ y temblar 5px no abría el
        // diálogo, y mantenerlo apretado en touch arrancaba un arrastre.
        //
        // En jsdom no se puede probar la propagación de verdad: sin `DndContext`,
        // `useDraggable` devuelve `listeners` vacío. La verificación de comportamiento
        // vive en navegador real; acá se blinda el invariante que la hace cierta.
        render(<ClienteCardRuta cliente={CLIENTE} onQuitar={() => {}} />)

        const card = screen.getByTestId('card-cliente-11')
        const superficie = card.querySelector('[aria-roledescription="draggable"]')
        const quitar = screen.getByRole('button', { name: /quitar de esta vuelta/i })

        expect(superficie).not.toBeNull()
        // La card NO es el nodo arrastrable ni lleva sus atributos: de eso depende también
        // el diálogo, que es hijo suyo en el árbol de React (React propaga por ahí, no por
        // el DOM, así que el portal no lo salva).
        expect(superficie).not.toBe(card)
        expect(card).not.toHaveAttribute('aria-roledescription', 'draggable')
        expect(superficie!.contains(quitar)).toBe(false)
        // Vacía: nada que se agregue a la card en el futuro puede caer adentro.
        expect(superficie!.childElementCount).toBe(0)
    })

    it('el diálogo no se abre solo si la fila deja de poder quitarse mientras está abierto', async () => {
        // Escenario real: con el diálogo abierto, un refetch en segundo plano (foco de la
        // ventana, o la invalidación de otra mutación) trae la fila ya `eliminado` porque
        // otro la quitó. El diálogo desaparece; si el estado se quedaba en `true`, al
        // restaurarla el "¿Quitar a X?" se abría solo, sin que nadie lo pidiera.
        const { rerender } = render(<ClienteCardRuta cliente={CLIENTE} onQuitar={() => {}} />)
        await userEvent.click(screen.getByRole('button', { name: /quitar de esta vuelta/i }))
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()

        rerender(
            <ClienteCardRuta
                cliente={{ ...CLIENTE, eliminado: true }}
                onQuitar={() => {}}
                onRestaurar={() => {}}
            />,
        )
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

        // …y al volver a pendiente sigue cerrado.
        rerender(
            <ClienteCardRuta cliente={CLIENTE} onQuitar={() => {}} onRestaurar={() => {}} />,
        )
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('una card eliminada no tiene superficie de arrastre, así "Restaurar" es seguro', () => {
        render(
            <ClienteCardRuta cliente={{ ...CLIENTE, eliminado: true }} onRestaurar={() => {}} />,
        )

        const card = screen.getByTestId('card-cliente-11')
        expect(card.querySelector('[aria-roledescription="draggable"]')).toBeNull()
        expect(screen.getByRole('button', { name: /restaurar/i })).toBeInTheDocument()
    })

    it('la copia del overlay no arrastra ni ofrece acciones', () => {
        // Es la card que sigue al cursor: si arrastrara, se registraría con el mismo id
        // que la real y le pisaría la medición a mitad del movimiento.
        render(
            <ClienteCardRuta
                cliente={CLIENTE}
                overlay
                onQuitar={() => {}}
                onRestaurar={() => {}}
            />,
        )

        expect(vi.mocked(useDraggable).mock.calls.at(-1)?.[0]).toMatchObject({
            id: 'overlay-11',
            disabled: true,
        })
        expect(
            screen.queryByRole('button', { name: /quitar de esta vuelta/i }),
        ).not.toBeInTheDocument()
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
        render(
            <ClienteCardRuta cliente={{ ...CLIENTE, eliminado: true }} onRestaurar={onRestaurar} />,
        )

        screen.getByRole('button', { name: /restaurar/i }).click()

        expect(onRestaurar).toHaveBeenCalledWith(11)
        // Sin diálogo de por medio: restaurar es el undo, no una acción destructiva.
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
})
