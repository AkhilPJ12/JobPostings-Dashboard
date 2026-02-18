import { render as rtlRender, screen } from '@testing-library/react'
import { ThemeToggle } from '@/components/theme-toggle'

// Mock next-themes
jest.mock('next-themes', () => ({
    useTheme: () => ({
        theme: 'light',
        setTheme: jest.fn(),
    }),
}))

describe('ThemeToggle', () => {
    it('should render theme toggle button', () => {
        rtlRender(<ThemeToggle />)
        // Button has aria-label "Switch to dark mode"
        const button = screen.getByRole('button', { name: /Switch to dark mode/i })
        expect(button).toBeInTheDocument()
    })
})
