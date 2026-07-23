export interface InitialURLCapture {
    pathname: string
    search: string
    params: { token: string | null }
    capturedAt: number
}

let initialCapture: InitialURLCapture | null = null

export function captureInitialURL(): InitialURLCapture {
    if (initialCapture !== null) return initialCapture
    const urlParams = new URLSearchParams(window.location.search)
    initialCapture = {
        pathname: window.location.pathname,
        search: window.location.search,
        params: { token: urlParams.get('token') },
        capturedAt: Date.now(),
    }
    return initialCapture
}

export function getInitialURLCapture(): InitialURLCapture | null {
    return initialCapture
}
