// src/hooks/useGeolocation.test.ts
import { vi } from 'vitest'
import { getCurrentCoord } from './useGeolocation'

describe('getCurrentCoord', () => {
    it('resolves "lat,lng" when permission is granted', async () => {
        const getCurrentPosition = vi.fn((ok: any) =>
            ok({ coords: { latitude: -34.6, longitude: -58.6 } }),
        )
        ;(global.navigator as any).geolocation = { getCurrentPosition }
        const coord = await getCurrentCoord()
        expect(coord).toBe('-34.6,-58.6')
    })

    it('resolves null when the user denies permission', async () => {
        const getCurrentPosition = vi.fn((_ok: any, err: any) => err({ code: 1 }))
        ;(global.navigator as any).geolocation = { getCurrentPosition }
        const coord = await getCurrentCoord()
        expect(coord).toBeNull()
    })

    it('resolves null when geolocation is unavailable', async () => {
        ;(global.navigator as any).geolocation = undefined
        const coord = await getCurrentCoord()
        expect(coord).toBeNull()
    })
})
