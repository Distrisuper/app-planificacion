import { useCallback, useEffect, useRef, useState } from 'react'

export function useToast() {
    const [message, setMessage] = useState<string | null>(null)
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    const showToast = useCallback((msg: string) => {
        clearTimeout(timeoutRef.current)
        setMessage(msg)
        timeoutRef.current = setTimeout(() => setMessage(null), 1900)
    }, [])

    useEffect(() => () => clearTimeout(timeoutRef.current), [])

    return { message, showToast }
}
