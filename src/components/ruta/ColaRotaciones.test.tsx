import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ColaRotaciones from './ColaRotaciones'
import type { IRotacionResumen } from '@/types/planificacion'

const base = {
    codigoParticularVendedor: 'V 2',
    fechaInicio: null,
    fechaFin: null,
    descripcion: null,
} as const

const COLA: IRotacionResumen[] = [
    { ...base, id: 7, estado: 'abierta', orden: null, descripcion: 'Ronda Agosto' },
    { ...base, id: 30, estado: 'programada', orden: 1 },
    { ...base, id: 31, estado: 'programada', orden: 2, descripcion: 'Ronda Octubre' },
]

function renderCola(overrides = {}) {
    const props = {
        rotaciones: COLA,
        activaId: 7,
        onElegir: vi.fn(),
        onCrear: vi.fn(),
        onCancelar: vi.fn(),
        onRenombrarRotacion: vi.fn(),
        onReordenar: vi.fn(),
        creando: false,
        ...overrides,
    }
    render(<ColaRotaciones {...props} />)
    return props
}

describe('señal de estado, independiente del nombre', () => {
    it('la rotación en curso se distingue AUNQUE tenga nombre propio', () => {
        // El caso que importa: al nombrar la rotación vigente, su etiqueta pasa a ser el
        // nombre y se perdía el cartel "Actual" — quedaba visualmente igual a una
        // programada. Justo en la que el vendedor está trabajando encima ahora.
        renderCola()
        expect(screen.getByText('en curso')).toBeInTheDocument()
    })

    it('una programada con nombre sigue mostrando su posición en la cola', () => {
        // Mismo problema del otro lado: nombrarla borraba el "#N" y no se sabía qué lugar
        // ocupa en la cola.
        renderCola()
        expect(screen.getByText('#2')).toBeInTheDocument()
    })

    it('la rotación en curso no muestra posición: no está en la cola', () => {
        renderCola()
        expect(screen.queryByText('#null')).not.toBeInTheDocument()
        // Solo la programada con nombre (orden 2) aporta un "#N".
        expect(screen.getAllByText(/^#\d+$/)).toHaveLength(1)
    })

    it('sin nombre no duplica la señal: la etiqueta ya dice Programada #N', () => {
        renderCola({
            rotaciones: [{ ...base, id: 30, estado: 'programada', orden: 1 }],
            activaId: 30,
        })
        expect(screen.getByRole('button', { name: 'Programada #1' })).toBeInTheDocument()
        expect(screen.queryByText('#1')).not.toBeInTheDocument()
    })
})

describe('ColaRotaciones', () => {
    it('usa la descripción como etiqueta cuando la rotación tiene una', () => {
        renderCola()
        // Nombres exactos (no regex): la card activa (id 7) también tiene un botón
        // "Nombrar Ronda Agosto" (el lápiz de DescripcionInline) que /Ronda Agosto/
        // matchea como substring, y "Ronda Octubre" colisiona con su propio
        // "Cancelar Ronda Octubre" por la misma razón.
        expect(screen.getByRole('button', { name: 'Ronda Agosto' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Ronda Octubre' })).toBeInTheDocument()
    })

    it('sin descripción, etiqueta la vigente como Actual y las demás por posición', () => {
        renderCola({
            rotaciones: [
                { ...base, id: 7, estado: 'abierta', orden: null },
                { ...base, id: 30, estado: 'programada', orden: 1 },
            ],
        })
        // Ídem: "Nombrar Actual" y "Cancelar Programada #1" matchean como substring.
        expect(screen.getByRole('button', { name: 'Actual' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Programada #1' })).toBeInTheDocument()
    })

    it('avisa qué rotación se eligió', async () => {
        const props = renderCola()
        await userEvent.click(screen.getByRole('button', { name: 'Ronda Octubre' }))
        expect(props.onElegir).toHaveBeenCalledWith(31)
    })

    it('la rotación vigente no se puede cancelar', () => {
        renderCola()
        // Una sola acción de cancelar por cada programada, ninguna para la abierta.
        expect(screen.getAllByRole('button', { name: /cancelar/i })).toHaveLength(2)
    })

    it('pide confirmación antes de cancelar', async () => {
        const props = renderCola()
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false)

        await userEvent.click(screen.getAllByRole('button', { name: /cancelar/i })[0])

        expect(confirmar).toHaveBeenCalled()
        expect(props.onCancelar).not.toHaveBeenCalled()
        confirmar.mockRestore()
    })

    it('cancela cuando se confirma', async () => {
        const props = renderCola()
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)

        await userEvent.click(screen.getAllByRole('button', { name: /cancelar/i })[0])

        expect(props.onCancelar).toHaveBeenCalledWith(30)
        confirmar.mockRestore()
    })

    it('el botón de agregar avisa y se bloquea mientras crea', async () => {
        const props = renderCola({ creando: true })
        const agregar = screen.getByRole('button', { name: /agregar rotación/i })

        expect(agregar).toBeDisabled()
        await userEvent.click(agregar)
        expect(props.onCrear).not.toHaveBeenCalled()
    })

    it('la primera programada no puede subir más', () => {
        renderCola()
        // COLA tiene 30 (orden 1) y 31 (orden 2). La 30 ya es la próxima en activarse.
        expect(
            screen.getByRole('button', { name: /adelantar programada #1/i }),
        ).toBeDisabled()
    })

    it('la última programada no puede bajar más', () => {
        renderCola()
        expect(
            screen.getByRole('button', { name: /atrasar ronda octubre/i }),
        ).toBeDisabled()
    })

    it('adelantar manda la posición anterior', async () => {
        const props = renderCola()

        await userEvent.click(screen.getByRole('button', { name: /adelantar ronda octubre/i }))

        // 31 estaba en orden 2: adelantar la lleva a 1.
        expect(props.onReordenar).toHaveBeenCalledWith(31, 1)
    })

    it('atrasar manda la posición siguiente', async () => {
        const props = renderCola()

        await userEvent.click(screen.getByRole('button', { name: /atrasar programada #1/i }))

        expect(props.onReordenar).toHaveBeenCalledWith(30, 2)
    })

    it('la rotación vigente no tiene flechas: no está en la cola', () => {
        renderCola()
        expect(
            screen.queryByRole('button', { name: /adelantar ronda agosto/i }),
        ).not.toBeInTheDocument()
    })
})
