import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTextoDebounced } from './useTextoDebounced'

afterEach(() => vi.useRealTimers())

describe('useTextoDebounced', () => {
    it('devuelve el valor inicial sin esperar', () => {
        const { result } = renderHook(() => useTextoDebounced('alma'))
        expect(result.current).toBe('alma')
    })

    it('no propaga el valor nuevo hasta que pasa el delay', () => {
        vi.useFakeTimers()
        const { result, rerender } = renderHook(({ t }) => useTextoDebounced(t), {
            initialProps: { t: 'al' },
        })

        rerender({ t: 'alma' })
        expect(result.current).toBe('al')

        act(() => vi.advanceTimersByTime(300))
        expect(result.current).toBe('alma')
    })

    it('cada tecla reinicia la espera: solo llega el último valor', () => {
        vi.useFakeTimers()
        const { result, rerender } = renderHook(({ t }) => useTextoDebounced(t), {
            initialProps: { t: 'a' },
        })

        rerender({ t: 'al' })
        act(() => vi.advanceTimersByTime(200))
        rerender({ t: 'alm' })
        act(() => vi.advanceTimersByTime(200))
        expect(result.current).toBe('a')

        act(() => vi.advanceTimersByTime(100))
        expect(result.current).toBe('alm')
    })
})
