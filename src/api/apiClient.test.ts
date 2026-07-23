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
