"use client"

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">Jobs could not be loaded</h1>
      <p className="text-sm text-muted-foreground">The job service is temporarily unavailable. Please try again.</p>
      <button type="button" onClick={reset} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        Try again
      </button>
    </main>
  )
}
