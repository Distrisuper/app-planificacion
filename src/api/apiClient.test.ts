import { apiClient } from './apiClient'

describe('apiClient', () => {
    it('adds the Bearer token from localStorage to requests', async () => {
        localStorage.setItem('access_token', 'tok-1')
        const config = await (apiClient.interceptors.request as any).handlers[0].fulfilled({
            headers: {},
        })
        expect(config.headers.Authorization).toBe('Bearer tok-1')
    })
})

describe('apiClient response interceptor', () => {
    const rejected = (apiClient.interceptors.response as any).handlers[0].rejected

    const originalLocation = window.location
    let reloadSpy: ReturnType<typeof vi.fn>

    beforeEach(() => {
        localStorage.setItem('access_token', 'tok-1')
        reloadSpy = vi.fn()
        // jsdom's window.location.reload is a non-configurable, non-writable own property
        // (it throws "Not implemented" if called), so it can't be spied on in place. Replace
        // the whole location object with a plain mock that has an assignable pathname.
        // @ts-expect-error - reassigning window.location for test purposes
        delete window.location
        ;(window as any).location = { ...originalLocation, pathname: '/agenda', reload: reloadSpy }
    })

    afterEach(() => {
        ;(window as any).location = originalLocation
        vi.restoreAllMocks()
    })

    it('clears the token and reloads for a plain 401 when not on the login page', async () => {
        window.location.pathname = '/agenda'
        const error = { response: { status: 401, data: {} } }
        const removeSpy = vi.spyOn(Storage.prototype, 'removeItem')

        await expect(rejected(error)).rejects.toBe(error)

        expect(removeSpy).toHaveBeenCalledWith('access_token')
        expect(reloadSpy).toHaveBeenCalledTimes(1)
    })

    it('clears the token but does not reload when already on /login (avoids reload loop)', async () => {
        window.location.pathname = '/login'
        const error = { response: { status: 401 } }
        const removeSpy = vi.spyOn(Storage.prototype, 'removeItem')

        await expect(rejected(error)).rejects.toBe(error)

        expect(removeSpy).toHaveBeenCalledWith('access_token')
        expect(reloadSpy).not.toHaveBeenCalled()
    })

    it('leaves the token and reload untouched for non-401 errors', async () => {
        const error = { response: { status: 500 } }
        const removeSpy = vi.spyOn(Storage.prototype, 'removeItem')

        await expect(rejected(error)).rejects.toBe(error)

        expect(removeSpy).not.toHaveBeenCalled()
        expect(reloadSpy).not.toHaveBeenCalled()
    })
})
