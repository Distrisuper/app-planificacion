import { render, screen } from '@testing-library/react'
import App from './App'

it('renders the app name', () => {
    render(<App />)
    expect(screen.getByText('app-planificacion')).toBeInTheDocument()
})
