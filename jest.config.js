const nextJest = require('next/jest')
const path = require('path')

const createJestConfig = nextJest({
    // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
    dir: './',
})

// Shared config
const sharedConfig = {
    rootDir: path.resolve(__dirname),
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
    },
    collectCoverageFrom: [
        'app/**/*.{js,jsx,ts,tsx}',
        'components/**/*.{js,jsx,ts,tsx}',
        'lib/**/*.{js,jsx,ts,tsx}',
        '!**/*.d.ts',
        '!**/node_modules/**',
        '!**/.next/**',
        '!**/coverage/**',
        '!**/jest.config.js',
    ],
}

// Frontend tests (components, integration) — need jsdom
const frontendConfig = {
    ...sharedConfig,
    displayName: 'frontend',
    testEnvironment: 'jest-environment-jsdom',
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    testMatch: [
        '**/__tests__/frontend/**/*.test.[jt]s?(x)',
        '**/__tests__/integration/**/*.test.[jt]s?(x)',
    ],
}

// Backend tests (database queries, Supabase) — use node
const backendConfig = {
    ...sharedConfig,
    displayName: 'backend',
    testEnvironment: 'node',
    testMatch: [
        '**/__tests__/backend/**/*.test.[jt]s?(x)',
    ],
}

// Lib tests (pure utilities) — use jsdom for compatibility
const libConfig = {
    ...sharedConfig,
    displayName: 'lib',
    testEnvironment: 'jest-environment-jsdom',
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    testMatch: [
        '**/__tests__/lib/**/*.test.[jt]s?(x)',
    ],
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = async () => {
    // Load .env.local for all test projects (Next.js createJestConfig does this internally,
    // but we need it applied to all projects in the multi-project setup)
    require('dotenv').config({ path: path.resolve(__dirname, '.env.local') })

    const nextConfig = await createJestConfig({})()

    // Extract transform config from Next.js config
    const { transform, transformIgnorePatterns, moduleNameMapper: nextModuleNameMapper } = nextConfig

    // Apply Next.js transform to all projects
    const applyNextTransforms = (config) => ({
        ...config,
        transform,
        transformIgnorePatterns,
        moduleNameMapper: {
            ...nextModuleNameMapper,
            ...config.moduleNameMapper,
        },
    })

    return {
        projects: [
            applyNextTransforms(frontendConfig),
            applyNextTransforms(backendConfig),
            applyNextTransforms(libConfig),
        ],
        coverageThreshold: {
            global: {
                branches: 70,
                functions: 70,
                lines: 70,
                statements: 70,
            },
        },
    }
}
