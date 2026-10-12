export default function Header() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line-1 bg-surface-0 px-4 lg:px-5">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4.5 18.5C8.5 18.5 8 6.5 12.5 6.5C16.5 6.5 16.5 16 20 5.5"
          stroke="var(--color-ink-2)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="4.5" cy="18.5" r="2.4" fill="var(--color-ink-3)" />
        <circle cx="20" cy="5.5" r="2.4" fill="var(--color-accent)" />
      </svg>
      <div className="flex items-baseline gap-2.5">
        <span className="text-lg font-semibold tracking-tight">ClearHaul</span>
        <span className="hidden text-xs text-ink-3 sm:inline">Weather-aware truck routing</span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span className="tnum hidden text-xs text-ink-3 md:inline">
          US truck routes · Open-Meteo hourly forecast
        </span>
        <a
          href="https://github.com/rajprakash00/weather-aware-truck-routing"
          target="_blank"
          rel="noreferrer"
          aria-label="Source on GitHub"
          className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-1"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
        </a>
      </div>
    </header>
  )
}
