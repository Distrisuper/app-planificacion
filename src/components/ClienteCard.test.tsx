import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ClienteCard from './ClienteCard'
import type { IAgendaClient } from '@/types/planificacion'

function cliente(over: Partial<IAgendaClient> = {}): IAgendaClient {
    return {
        codigoCliente: 'C1',
        codigoParticularCliente: '10034',
        nombreCliente: 'ALMACEN DON JOSE',
        direccion: 'Av. San Martín 100',
        cicloClienteId: 42,
        dia: 1,
        estado: 'pendiente',
        visitaId: null,
        rubrosPendientes: 0,
        ...over,
    }
}

const noop = () => {}
const handlers = {
    onAbrir: noop,
    onEstadoVisita: noop,
    onIniciarVisita: noop,
    onAbrirAppExterna: noop,
}

it('un cliente pendiente muestra el código y las acciones', () => {
    render(<ClienteCard cliente={cliente({ telefono: '1140506070' })} {...handlers} />)
    expect(screen.getByText('#10034')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /propuesta/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /llamar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reagendar/i })).toBeInTheDocument()
})

it('en_curso muestra el badge y sigue permitiendo abrir la visita', () => {
    render(<ClienteCard cliente={cliente({ estado: 'en_curso', visitaId: 7 })} {...handlers} />)
    expect(screen.getByText(/en curso/i)).toBeInTheDocument()
})

it('un cliente visitado muestra "Ver resumen" y no llamar/reagendar', () => {
    render(<ClienteCard cliente={cliente({ estado: 'visitada', visitaId: 7 })} {...handlers} />)
    expect(screen.getByRole('button', { name: /ver resumen/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^propuesta$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /llamar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reagendar/i })).not.toBeInTheDocument()
})

it('"Ver resumen" abre el mismo flujo que Propuesta, con el cliente completo', () => {
    const onAbrir = vi.fn()
    render(
        <ClienteCard
            cliente={cliente({ estado: 'visitada', visitaId: 7 })}
            {...handlers}
            onAbrir={onAbrir}
        />,
    )
    fireEvent.click(screen.getByRole('button', { name: /ver resumen/i }))
    expect(onAbrir).toHaveBeenCalledWith(expect.objectContaining({ cicloClienteId: 42 }))
})

it('no_visita y reagendada (sin visita real) no muestran fila de acciones', () => {
    // Se fija el conjunto EXACTO de botones y no un regex nominal: así un botón nuevo con
    // cualquier otro nombre también rompe el test. Pagos y Versus son las apps externas
    // registradas — siguen ofreciéndose en un cliente resuelto, a diferencia de las del ciclo.
    const botones = () => screen.getAllByRole('button').map(b => b.textContent)
    const { rerender } = render(
        <ClienteCard cliente={cliente({ estado: 'no_visita', telefono: '1140506070' })} {...handlers} />,
    )
    expect(botones()).toEqual(['Pagos', 'Versus'])
    expect(screen.queryByRole('link', { name: /llamar/i })).not.toBeInTheDocument()

    rerender(<ClienteCard cliente={cliente({ estado: 'reagendada' })} {...handlers} />)
    expect(botones()).toEqual(['Pagos', 'Versus'])
})

it('un cliente resuelto muestra el nombre tachado', () => {
    render(<ClienteCard cliente={cliente({ estado: 'visitada', visitaId: 7 })} {...handlers} />)
    expect(screen.getByText('Almacen Don Jose')).toHaveStyle({ textDecoration: 'line-through' })
})

it('no_visita y reagendada se distinguen visualmente', () => {
    const { rerender } = render(<ClienteCard cliente={cliente({ estado: 'no_visita' })} {...handlers} />)
    expect(screen.getByText(/no visitado/i)).toBeInTheDocument()
    rerender(<ClienteCard cliente={cliente({ estado: 'reagendada' })} {...handlers} />)
    expect(screen.getByText(/reagendada/i)).toBeInTheDocument()
})

it('no_visita pinta la card de naranja; visitada la pinta de verde', () => {
    const { container, rerender } = render(
        <ClienteCard cliente={cliente({ estado: 'no_visita' })} {...handlers} />,
    )
    expect(container.firstChild).toHaveStyle({ background: '#FEF8EC', borderColor: '#F0D8A8' })

    rerender(<ClienteCard cliente={cliente({ estado: 'visitada', visitaId: 7 })} {...handlers} />)
    expect(container.firstChild).toHaveStyle({ background: '#F3FAF5', borderColor: '#BFE6CE' })
})

it('un cliente pendiente ofrece iniciar la visita directo', () => {
    const onIniciarVisita = vi.fn()
    render(<ClienteCard cliente={cliente()} {...handlers} onIniciarVisita={onIniciarVisita} />)
    fireEvent.click(screen.getByRole('button', { name: /iniciar visita/i }))
    expect(onIniciarVisita).toHaveBeenCalledWith(expect.objectContaining({ cicloClienteId: 42 }))
})

it('en_curso ya no ofrece iniciar la visita de nuevo', () => {
    render(<ClienteCard cliente={cliente({ estado: 'en_curso', visitaId: 7 })} {...handlers} />)
    expect(screen.queryByRole('button', { name: /iniciar visita/i })).not.toBeInTheDocument()
})

it('con otra visita en curso, un pendiente muestra el bloqueo en vez de "Iniciar visita"', () => {
    const onIniciarVisita = vi.fn()
    render(
        <ClienteCard
            cliente={cliente()}
            {...handlers}
            onIniciarVisita={onIniciarVisita}
            otraVisitaEnCurso
        />,
    )
    expect(screen.queryByRole('button', { name: /iniciar visita/i })).not.toBeInTheDocument()
    expect(screen.getByText(/cerrá la visita en curso/i)).toBeInTheDocument()
    // Propuesta, llamar y reagendar siguen disponibles: no bloquean consulta.
    expect(screen.getByRole('button', { name: /propuesta/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reagendar/i })).toBeInTheDocument()
})

it('en modo preview no hay botones de acción, pero la dirección sigue enlazando al mapa', () => {
    // La compuerta real la da el tipo (IPreviewClient no llega acá), pero la card
    // igual tiene que renderizarse sin botones cuando se hojea otra semana. El link
    // al mapa no es una acción que mute nada, así que no está gateado por `operable`.
    render(<ClienteCard cliente={cliente()} {...handlers} modo="preview" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /san martín 100/i })).toBeInTheDocument()
})

it('los handlers reciben el cliente completo, no el código', () => {
    const onAbrir = vi.fn()
    render(<ClienteCard cliente={cliente()} {...handlers} onAbrir={onAbrir} />)
    fireEvent.click(screen.getByRole('button', { name: /propuesta/i }))
    expect(onAbrir).toHaveBeenCalledWith(expect.objectContaining({ cicloClienteId: 42 }))
})

it('el botón de reagendar recibe el cliente completo', () => {
    const onEstadoVisita = vi.fn()
    render(<ClienteCard cliente={cliente()} {...handlers} onEstadoVisita={onEstadoVisita} />)
    fireEvent.click(screen.getByRole('button', { name: /reagendar/i }))
    expect(onEstadoVisita).toHaveBeenCalledWith(expect.objectContaining({ cicloClienteId: 42 }))
})

it('la dirección enlaza a Google Maps con coordenadas cuando están disponibles', () => {
    render(<ClienteCard cliente={cliente({ latitud: -31.4, longitud: -64.2 })} {...handlers} />)
    const link = screen.getByRole('link', { name: /san martín 100/i })
    expect(link).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=-31.4,-64.2')
})

it('sin coordenadas, la dirección enlaza a Google Maps por texto', () => {
    render(<ClienteCard cliente={cliente({ direccion: 'Av. San Martín 100' })} {...handlers} />)
    const link = screen.getByRole('link', { name: /san martín 100/i })
    expect(link).toHaveAttribute(
        'href',
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Av. San Martín 100')}`,
    )
})

it('sin teléfono limpio no se muestra el botón de llamar', () => {
    render(<ClienteCard cliente={cliente({ telefono: '1171473562 / 46641751' })} {...handlers} />)
    expect(screen.queryByRole('link', { name: /llamar/i })).not.toBeInTheDocument()
})

it('ofrece las apps externas entre las utilidades del header', () => {
    const onAbrirAppExterna = vi.fn()
    render(
        <ClienteCard
            cliente={cliente()}
            {...handlers}
            onAbrirAppExterna={onAbrirAppExterna}
        />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Pagos' }))
    expect(onAbrirAppExterna).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'pagos' }),
        expect.objectContaining({ codigoParticularCliente: '10034' }),
    )
})

// En preview (hojeando otra semana) no se opera: nada de apps externas.
it('no ofrece apps externas en modo preview', () => {
    render(<ClienteCard cliente={cliente()} {...handlers} modo="preview" />)
    expect(screen.queryByRole('button', { name: 'Pagos' })).not.toBeInTheDocument()
})

// Un cliente ya visitado también tiene pagos que mirar: la utilidad no depende de que
// el ciclo esté pendiente, a diferencia de Llamar/Reagendar.
it('sigue ofreciendo apps externas en un cliente ya resuelto', () => {
    render(<ClienteCard cliente={cliente({ estado: 'visitada', visitaId: 7 })} {...handlers} />)
    expect(screen.getByRole('button', { name: 'Pagos' })).toBeInTheDocument()
})
