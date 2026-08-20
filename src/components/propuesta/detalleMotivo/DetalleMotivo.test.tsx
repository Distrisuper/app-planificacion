import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import DetalleMotivo from './DetalleMotivo'
import type { ICampoMotivo, IMotivo } from '@/types/planificacion'

function campo(over: Partial<ICampoMotivo> = {}): ICampoMotivo {
    return {
        campo: 'plazo_dias',
        tipo: 'numero',
        label: 'Plazo solicitado',
        placeholder: null,
        unidad: null,
        requerido: true,
        orden: 10,
        ...over,
    }
}

function motivo(campos: ICampoMotivo[], codigo: string | null = null): IMotivo {
    return {
        motivoId: 99,
        nivel: 'ofrecimiento',
        descripcion: 'Plazo',
        resultado: 'perdido',
        codigo,
        campos,
    }
}

const base = { marcas: [], onChange: vi.fn(), valores: {} }

describe('DetalleMotivo — renderizado genérico', () => {
    it('dibuja un campo numero y commitea un número, no un string', () => {
        const onChange = vi.fn()
        render(<DetalleMotivo {...base} motivo={motivo([campo()])} onChange={onChange} />)

        fireEvent.change(screen.getByLabelText(/plazo solicitado/i), {
            target: { value: '30' },
        })

        expect(onChange).toHaveBeenCalledWith({ plazo_dias: 30 })
    })

    it('muestra la unidad junto al label', () => {
        render(
            <DetalleMotivo {...base} motivo={motivo([campo({ unidad: 'días' })])} />,
        )

        expect(screen.getByLabelText(/plazo solicitado \(días\)/i)).toBeInTheDocument()
    })

    it('dibuja un textarea para tipo textarea', () => {
        const declarado = campo({ campo: 'por_que', tipo: 'textarea', label: 'Por qué' })

        render(<DetalleMotivo {...base} motivo={motivo([declarado])} />)

        expect(screen.getByLabelText(/por qué/i).tagName).toBe('TEXTAREA')
    })

    it('un campo texto commitea el string tal cual', () => {
        const onChange = vi.fn()
        const declarado = campo({ campo: 'competidor', tipo: 'texto', label: 'Competidor' })

        render(<DetalleMotivo {...base} motivo={motivo([declarado])} onChange={onChange} />)
        fireEvent.change(screen.getByLabelText(/competidor/i), { target: { value: 'Corven' } })

        expect(onChange).toHaveBeenCalledWith({ competidor: 'Corven' })
    })

    it('respeta el orden en que vienen los campos', () => {
        const campos = [
            campo({ campo: 'competidor', tipo: 'texto', label: 'Competidor', orden: 10 }),
            campo({ campo: 'mi_precio', label: 'Mi precio', orden: 20 }),
        ]

        render(<DetalleMotivo {...base} motivo={motivo(campos)} />)

        const labels = screen.getAllByText(/competidor|mi precio/i).map(e => e.textContent)
        expect(labels).toEqual(['Competidor', 'Mi precio'])
    })

    // La regla de degradación: no se dibuja, y no rompe la pantalla.
    it('saltea un tipo que no sabe dibujar sin romper', () => {
        const raro = campo({ campo: 'fecha_promesa', tipo: 'fecha' as never, label: 'Fecha' })

        render(<DetalleMotivo {...base} motivo={motivo([raro, campo()])} />)

        expect(screen.queryByLabelText(/fecha/i)).not.toBeInTheDocument()
        expect(screen.getByLabelText(/plazo solicitado/i)).toBeInTheDocument()
    })

    // El punto decimal a medio tipear es la razón de existir de useCampoNumero: el
    // renderizador genérico tiene que seguir usándolo.
    it('el punto decimal no se trunca al tipear', () => {
        const declarado = campo({ campo: 'mi_precio', label: 'Mi precio' })

        render(<DetalleMotivo {...base} motivo={motivo([declarado])} />)
        const input = screen.getByLabelText(/mi precio/i) as HTMLInputElement
        fireEvent.change(input, { target: { value: '150.' } })

        expect(input.value).toBe('150.')
    })
})

describe('DetalleMotivo — línea derivada', () => {
    const camposPrecio = [
        campo({ campo: 'precio_competidor', label: 'Precio del competidor', orden: 30 }),
        campo({ campo: 'mi_precio', label: 'Mi precio', orden: 40 }),
    ]

    it('Precio muestra el % contra el competidor', () => {
        render(
            <DetalleMotivo
                {...base}
                motivo={motivo(camposPrecio, 'PRECIO')}
                valores={{ precio_competidor: 150, mi_precio: 130 }}
            />,
        )

        expect(
            screen.getByText(/-13\.3% más barato que el competidor/i),
        ).toBeInTheDocument()
    })

    it('sin los dos precios no muestra nada derivado', () => {
        render(
            <DetalleMotivo
                {...base}
                motivo={motivo(camposPrecio, 'PRECIO')}
                valores={{ mi_precio: 130 }}
            />,
        )

        expect(screen.queryByText(/que el competidor/i)).not.toBeInTheDocument()
    })

    it('Flete muestra cuánto pesa sobre la compra', () => {
        const campos = [
            campo({ campo: 'valor_flete', label: 'Valor del flete' }),
            campo({ campo: 'compra_futuro', label: 'Compra a futuro', orden: 20 }),
        ]

        render(
            <DetalleMotivo
                {...base}
                motivo={motivo(campos, 'FLETE')}
                valores={{ valor_flete: 60000, compra_futuro: 3000000 }}
            />,
        )

        expect(screen.getByText(/el flete representa el 2\.0% de la compra/i)).toBeInTheDocument()
    })

    // El catálogo puede ir por delante del deploy: un codigo sin derivado registrado dibuja
    // los campos igual, sin línea calculada.
    it('un codigo sin derivado registrado no rompe', () => {
        render(<DetalleMotivo {...base} motivo={motivo([campo()], 'CODIGO_NUEVO')} />)

        expect(screen.getByLabelText(/plazo solicitado/i)).toBeInTheDocument()
    })
})
