import { cn } from '@/lib/utils'

export type ViewMode = 'pretty' | 'raw'

interface ViewToggleProps {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
}

/**
 * A tiny segmented control that switches between "Pretty" and "Raw" views.
 *
 * Used by renderers that have both a structured view (JSON tree, form table)
 * and a raw text view (syntax-highlighted source).
 */
export function ViewToggle({ mode, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 p-0.5">
      <button
        type="button"
        onClick={() => onChange('pretty')}
        className={cn(
          'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
          mode === 'pretty'
            ? 'bg-white/10 text-gray-200'
            : 'text-gray-500 hover:text-gray-300',
        )}
      >
        Pretty
      </button>
      <button
        type="button"
        onClick={() => onChange('raw')}
        className={cn(
          'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
          mode === 'raw'
            ? 'bg-white/10 text-gray-200'
            : 'text-gray-500 hover:text-gray-300',
        )}
      >
        Raw
      </button>
    </div>
  )
}
