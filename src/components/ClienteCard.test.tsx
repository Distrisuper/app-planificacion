import { render, screen, fireEvent, within } from '@testing-library/react'
import { vi } from 'vitest'
import ClienteCard from './ClienteCard'
import type { IAgendaClient } from '@/types/planificacion'

function cliente(over: Partial<IAgendaClient> = {}): IAgendaClient {
    return {
        codigoCliente: 'C1',
        codigoParticularCliente: '10034',
        nombreCliente: 'ALMACEN DON JOSE',
        direccion: 'Av. San Martín 100',
        rotacionClienteId: 42,
        dia: 1,
        estado: 'pendiente',
        visitaId: null,
        ofrecimientosPendientes: 0,
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
    expect(onAbrir).toHaveBeenCalledWith(expect.objectContaining({ rotacionClienteId: 42 }))
})

it('no_visita (sin visita real) no muestra fila de acciones', () => {
    // Se fija el conjunto EXACTO de botones y no un regex nominal: así un botón nuevo con
    // cualquier otro nombre también rompe el test. Pagos, Versus y CRM son las apps externas
    // registradas — siguen ofreciéndose en un cliente resuelto, a diferencia de las del ciclo.
    const botones = () => screen.getAllByRole('button').map(b => b.textContent)
    render(
        <ClienteCard cliente={cliente({ estado: 'no_visita', telefono: '1140506070' })} {...handlers} />,
    )
    expect(botones()).toEqual(['Pagos', 'Versus', 'CRM'])
    expect(screen.queryByRole('link', { name: /llamar/i })).not.toBeInTheDocument()
})

it('un cliente resuelto muestra el nombre tachado', () => {
    render(<ClienteCard cliente={cliente({ estado: 'visitada', visitaId: 7 })} {...handlers} />)
    expect(screen.getByText('Almacen Don Jose')).toHaveStyle({ textDecoration: 'line-through' })
})

it('no_visita muestra el badge de estado', () => {
    render(<ClienteCard cliente={cliente({ estado: 'no_visita' })} {...handlers} />)
    expect(screen.getByText(/no visitado/i)).toBeInTheDocument()
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
    expect(onIniciarVisita).toHaveBeenCalledWith(expect.objectContaining({ rotacionClienteId: 42 }))
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

it('en modo preview también se puede iniciar visita: el backend abre la semana solo', () => {
    render(<ClienteCard cliente={cliente({ estado: 'pendiente' })} {...handlers} modo="preview" />)
    expect(screen.getByRole('button', { name: /iniciar visita/i })).toBeInTheDocument()
})

it('en modo preview la dirección sigue enlazando al mapa', () => {
    render(<ClienteCard cliente={cliente()} {...handlers} modo="preview" />)
    expect(screen.getByRole('link', { name: /san martín 100/i })).toBeInTheDocument()
})

it('los handlers reciben el cliente completo, no el código', () => {
    const onAbrir = vi.fn()
    render(<ClienteCard cliente={cliente()} {...handlers} onAbrir={onAbrir} />)
    fireEvent.click(screen.getByRole('button', { name: /propuesta/i }))
    expect(onAbrir).toHaveBeenCalledWith(expect.objectContaining({ rotacionClienteId: 42 }))
})

it('el botón de reagendar recibe el cliente completo', () => {
    const onEstadoVisita = vi.fn()
    render(<ClienteCard cliente={cliente()} {...handlers} onEstadoVisita={onEstadoVisita} />)
    fireEvent.click(screen.getByRole('button', { name: /reagendar/i }))
    expect(onEstadoVisita).toHaveBeenCalledWith(expect.objectContaining({ rotacionClienteId: 42 }))
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

it('ofrece las apps externas en la banda de contexto de la card', () => {
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

// Con el backend abriendo la semana que haga falta, una card de "otra semana" tiene lo
// mismo que una operable — apps externas incluidas (ver decisión de diseño del plan).
it('también ofrece apps externas en modo preview', () => {
    render(<ClienteCard cliente={cliente()} {...handlers} modo="preview" />)
    expect(screen.getByRole('button', { name: 'Pagos' })).toBeInTheDocument()
})

// Un cliente ya visitado también tiene pagos que mirar: la utilidad no depende de que
// el ciclo esté pendiente, a diferencia de Llamar/Reagendar.
it('sigue ofreciendo apps externas en un cliente ya resuelto', () => {
    render(<ClienteCard cliente={cliente({ estado: 'visitada', visitaId: 7 })} {...handlers} />)
    expect(screen.getByRole('button', { name: 'Pagos' })).toBeInTheDocument()
})

// La regresión que motivó el rediseño: con cuatro chips el header envolvía a dos filas y
// pesaba más que el nombre del cliente. Se fija el conjunto EXACTO de controles del
// contenedor de utilidades (no un "no está Pagos"), así que cualquier chip nuevo que
// alguien meta ahí — apps externas u otro — rompe el test.
it('el header tiene exactamente dos utilidades: llamar y reagendar', () => {
    render(<ClienteCard cliente={cliente({ telefono: '1140506070' })} {...handlers} />)
    const header = screen.getByRole('link', { name: /llamar/i }).parentElement!
    expect(
        Array.from(header.children).map(el => el.getAttribute('aria-label') ?? el.textContent),
    ).toEqual(['Llamar', 'Reagendar'])
    // Y las apps siguen existiendo, pero fuera de ese contenedor.
    expect(within(header).queryByRole('button', { name: 'Pagos' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pagos' })).toBeInTheDocument()
})
