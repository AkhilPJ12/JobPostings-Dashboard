import { render, screen, fireEvent } from '@/__tests__/utils/test-utils'
import { ThemeToggle } from '@/components/theme-toggle'

// Mock next-themes
jest.mock('next-themes', () => ({
    useTheme: () => ({
        theme: 'light',
        setTheme: jest.fn(),
    }),
}))

describe('ThemeToggle', () => {
    it('should render toggle button', () => {
        render(<ThemeToggle />)
        const button = screen.getByRole('button', { name: /toggle theme/i })
        expect(button).toBeInTheDocument()
    })

    it('should have correct aria-label', () => {
        render(<ThemeToggle />)
        const button = screen.getByRole('button', { name: /toggle theme/i })
        expect(button).toHaveAttribute('aria-label', 'Toggle theme')
    })
})
