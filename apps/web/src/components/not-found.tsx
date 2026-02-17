import { Link } from '@tanstack/react-router'

export function NotFoundPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="text-center">
        <p className="bg-gradient-to-br from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-[8rem] font-extrabold leading-none tracking-tighter text-transparent">
          404
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-foreground">
          Page not found
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
          <Link
            to="/docs"
            className="inline-flex h-10 items-center rounded-lg border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Documentation
          </Link>
        </div>
      </div>
    </div>
  )
}
