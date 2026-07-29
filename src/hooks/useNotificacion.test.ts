import { act, renderHook } from '@testing-library/react'
import { useNotificacion } from './useNotificacion'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('arranca sin notificación', () => {
    const { result } = renderHook(() => useNotificacion())
    expect(result.current.notificacion).toBeNull()
})

it('mostrar setea tipo y mensaje', () => {
    const { result } = renderHook(() => useNotificacion())
    act(() => result.current.mostrar('exito', 'Registrado'))
    expect(result.current.notificacion).toEqual({ tipo: 'exito', mensaje: 'Registrado' })
})

it('se auto-oculta a los 5000ms, sin importar el tipo', () => {
    const { result } = renderHook(() => useNotificacion())
    act(() => result.current.mostrar('exito', 'Registrado'))
    act(() => vi.advanceTimersByTime(4999))
    expect(result.current.notificacion).not.toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.notificacion).toBeNull()
})

it('una nueva notificación reemplaza a la anterior y resetea el timer', () => {
    const { result } = renderHook(() => useNotificacion())
    act(() => result.current.mostrar('exito', 'Primero'))
    act(() => vi.advanceTimersByTime(4000))
    act(() => result.current.mostrar('error', 'Segundo'))
    expect(result.current.notificacion).toEqual({ tipo: 'error', mensaje: 'Segundo' })

    // Si no se hubiera reseteado el timer, el timeout del primer "mostrar" (a los 5000ms
    // totales) la habría ocultado acá.
    act(() => vi.advanceTimersByTime(1500))
    expect(result.current.notificacion).toEqual({ tipo: 'error', mensaje: 'Segundo' })
})

it('ocultar la cierra antes de tiempo', () => {
    const { result } = renderHook(() => useNotificacion())
    act(() => result.current.mostrar('exito', 'Registrado'))
    act(() => result.current.ocultar())
    expect(result.current.notificacion).toBeNull()
})
