import { vi } from 'vitest'

const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }))
vi.mock('axios', () => ({
    default: { create: () => ({ post, get }) },
}))

import { login, getMe } from './authApi'

describe('authApi', () => {
    beforeEach(() => vi.clearAllMocks())

    it('login posts credentials and returns the token on success', async () => {
        post.mockResolvedValue({ data: { message: 'success', access_token: 'tok123' } })
        const res = await login('user@x.com', 'pass')
        expect(post).toHaveBeenCalledWith('/api/lupita/login', { email: 'user@x.com', password: 'pass' })
        expect(res).toEqual({ token: 'tok123' })
    })

    it('login throws when the backend does not report success', async () => {
        post.mockResolvedValue({ data: { message: 'error', error: 'bad credentials' } })
        await expect(login('user@x.com', 'wrong')).rejects.toThrow()
    })

    it('getMe sends the Bearer token and returns the user payload', async () => {
        get.mockResolvedValue({ data: { id: 1, name: 'Martín', email: 'user@x.com', rol: 'vendedor' } })
        const res = await getMe('tok123')
        expect(get).toHaveBeenCalledWith('/api/auth/me', { headers: { Authorization: 'Bearer tok123' } })
        expect(res.rol).toBe('vendedor')
    })
})
