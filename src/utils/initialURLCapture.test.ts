import { captureInitialURL, getInitialURLCapture } from './initialURLCapture'

describe('captureInitialURL', () => {
    it('captures the token from the query string', () => {
        window.history.replaceState({}, '', '/?token=abc123')
        const capture = captureInitialURL()
        expect(capture.params.token).toBe('abc123')
        expect(getInitialURLCapture()?.params.token).toBe('abc123')
    })
})
