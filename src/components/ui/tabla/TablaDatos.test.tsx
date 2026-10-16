import { fireEvent, render, screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import TablaDatos, { type TablaDatosProps } from './TablaDatos'
import { definirColumnas } from './columnas'

interface Fila {
    id: string
    nombre: string
    codigo: string
    venta: number | null
    clientes: number
    cumplimiento: number | null
}

const DATOS: Fila[] = [
    { id: 'b', nombre: 'José Pérez', codigo: 'J2', venta: null, clientes: 3, cumplimiento: null },
    { id: 'a', nombre: 'Zárate', codigo: 'Z1', venta: 850_000, clientes: 12_480, cumplimiento: 0.31 },
    { id: 'c', nombre: 'álvarez', codigo: 'A3', venta: 1_234_567, clientes: 40, cumplimiento: 0.9 },
]

const COLUMNAS = definirColumnas<Fila>(c => [
    c.texto('nombre', 'Nombre', f => f.nombre, { secundaria: f => f.codigo }),
    c.monto('venta', 'Venta', f => f.venta, { total: 'suma' }),
    c.cantidad('clientes', 'Clientes', f => f.clientes, { total: 'suma' }),
    c.porcentaje('cumplimiento', 'Cumplimiento', f => f.cumplimiento),
])

function montar(props: Partial<TablaDatosProps<Fila>> = {}) {
    return render(
        <TablaDatos
            datos={DATOS}
            columnas={COLUMNAS}
            getRowId={f => f.id}
            etiqueta="Prueba"
            unidad={{ singular: 'persona', plural: 'personas' }}
            {...props}
        />,
    )
}

/** Nombres de las filas de datos en el orden en que se ven (sin encabezado ni total). */
const nombres = () =>
    within(screen.getByRole('table'))
        .getAllByRole('row')
        .filter(r => r.closest('tbody'))
        .map(r => within(r).getAllByRole('cell')[0].querySelector('span')?.textContent)

const ordenar = (columna: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${columna}`) }))

describe('TablaDatos', () => {
    it('el texto ordena asc → desc → sin orden, en español (sin importar acentos ni mayúsculas)', () => {
        montar()
        expect(nombres()).toEqual(['José Pérez', 'Zárate', 'álvarez'])
        ordenar('Nombre')
        expect(nombres()).toEqual(['álvarez', 'José Pérez', 'Zárate'])
        expect(screen.getByRole('columnheader', { name: /Nombre/ })).toHaveAttribute('aria-sort', 'ascending')
        ordenar('Nombre')
        expect(nombres()).toEqual(['Zárate', 'José Pérez', 'álvarez'])
        expect(screen.getByRole('columnheader', { name: /Nombre/ })).toHaveAttribute('aria-sort', 'descending')
        ordenar('Nombre')
        expect(nombres()).toEqual(['José Pérez', 'Zárate', 'álvarez'])
        expect(screen.getByRole('columnheader', { name: /Nombre/ })).toHaveAttribute('aria-sort', 'none')
    })

    it('los números arrancan de mayor a menor y los vacíos quedan al final en los dos sentidos', () => {
        montar()
        ordenar('Venta')
        expect(nombres()).toEqual(['álvarez', 'Zárate', 'José Pérez'])
        ordenar('Venta')
        expect(nombres()).toEqual(['Zárate', 'álvarez', 'José Pérez'])
    })

    it('respeta el orden inicial', () => {
        montar({ ordenInicial: { id: 'cumplimiento', desc: true } })
        expect(nombres()).toEqual(['álvarez', 'Zárate', 'José Pérez'])
    })

    it('busca sin acentos ni mayúsculas, en el texto y en la línea secundaria, y el contador dice N de M', () => {
        montar({ buscar: { placeholder: 'Buscar persona' } })
        expect(screen.getByText('3 personas')).toBeInTheDocument()
        fireEvent.change(screen.getByPlaceholderText('Buscar persona'), { target: { value: 'jose PEREZ' } })
        expect(nombres()).toEqual(['José Pérez'])
        expect(screen.getByText('1 de 3 personas')).toBeInTheDocument()
        fireEvent.change(screen.getByPlaceholderText('Buscar persona'), { target: { value: 'a3' } })
        expect(nombres()).toEqual(['álvarez'])
    })

    it('el total suma solo las filas filtradas, con el formato de su tipo', () => {
        montar({ buscar: { placeholder: 'Buscar persona' } })
        const total = () => screen.getByTestId('fila-total')
        expect(within(total()).getByText('Total')).toBeInTheDocument()
        expect(total()).toHaveTextContent('12.523')
        expect(total()).toHaveTextContent('$ 2,1 M')
        fireEvent.change(screen.getByPlaceholderText('Buscar persona'), { target: { value: 'zarate' } })
        expect(total()).toHaveTextContent('12.480')
        expect(total()).toHaveTextContent('$ 850 k')
    })

    it('formatea por tipo: monto abreviado, cantidad con miles, porcentaje sin decimales y vacío como —', () => {
        montar()
        const celdas = (id: string) => within(screen.getByTestId(`fila-${id}`)).getAllByRole('cell').map(c => c.textContent)
        expect(celdas('a')).toEqual(['ZárateZ1', '$ 850 k', '12.480', '31%'])
        expect(celdas('b')).toEqual(['José PérezJ2', '—', '3', '—'])
        expect(celdas('c')).toEqual(['álvarezA3', '$ 1,2 M', '40', '90%'])
    })

    it('los números van a la derecha y con cifras tabulares', () => {
        montar()
        const celda = within(screen.getByTestId('fila-a')).getAllByRole('cell')[1]
        expect(celda.className).toMatch(/text-right/)
        expect(celda.className).toMatch(/tabular-nums/)
    })

    it('el clic (o Enter) en una fila clicable la abre; las demás no son clicables', () => {
        const onClickFila = vi.fn()
        montar({ onClickFila, filaClicable: f => f.id !== 'b' })
        fireEvent.click(screen.getByTestId('fila-a'))
        expect(onClickFila).toHaveBeenCalledWith(DATOS.find(f => f.id === 'a'))
        fireEvent.keyDown(screen.getByTestId('fila-c'), { key: 'Enter' })
        expect(onClickFila).toHaveBeenCalledWith(DATOS.find(f => f.id === 'c'))
        fireEvent.click(screen.getByTestId('fila-b'))
        expect(onClickFila).toHaveBeenCalledTimes(2)
        expect(screen.getByTestId('fila-b')).not.toHaveAttribute('tabindex')
    })

    it('numerar pone la posición en el orden actual, no la original', () => {
        montar({ numerar: true, testIdFila: f => `fila-${f.id}` })
        ordenar('Clientes')
        expect(within(screen.getByTestId('fila-a')).getAllByRole('cell')[0]).toHaveTextContent('1')
        expect(within(screen.getByTestId('fila-b')).getAllByRole('cell')[0]).toHaveTextContent('3')
    })

    it('el porcentaje con tono se muestra como pill con texto', () => {
        const columnas = definirColumnas<Fila>(c => [
            c.texto('nombre', 'Nombre', f => f.nombre),
            c.porcentaje('cumplimiento', 'Cumplimiento', f => f.cumplimiento, {
                tono: v => (v === null ? 'neutro' : v >= 0.8 ? 'ok' : 'mal'),
            }),
        ])
        montar({ columnas })
        expect(within(screen.getByTestId('fila-c')).getByText('90%')).toHaveAttribute('data-tono', 'ok')
        expect(within(screen.getByTestId('fila-a')).getByText('31%')).toHaveAttribute('data-tono', 'mal')
    })

    it('sin filas muestra el mensaje de vacío', () => {
        montar({ datos: [], mensajeVacio: 'Nadie en este período.' })
        expect(screen.getByText('Nadie en este período.')).toBeInTheDocument()
    })
})
