import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/**
 * Small inline copy-to-clipboard button used inside body viewers.
 *
 * Displays a "Copy" label by default and briefly switches to "Copied"
 * after a successful clipboard write.
 */
export function CopyBodyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
    >
      {copied ? (
        <>
          <Check className="size-3" />
          Copied
        </>
      ) : (
        <>
          <Copy className="size-3" />
          Copy
        </>
      )}
    </button>
  )
}
