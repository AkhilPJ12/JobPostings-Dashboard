import React, { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { ThemeProvider } from '@/components/theme-provider'

// Custom render function that includes providers
function customRender(
    ui: ReactElement,
    options?: Omit<RenderOptions, 'wrapper'>
) {
    const Wrapper = ({ children }: { children: React.ReactNode }) => {
        return (
            <ThemeProvider
                attribute="class"
                defaultTheme="light"
                enableSystem={false}
                disableTransitionOnChange
            >
                {children}
            </ThemeProvider>
        )
    }

    return render(ui, { wrapper: Wrapper, ...options })
}

// Re-export everything
export * from '@testing-library/react'

// Override render method
export { customRender as render }
