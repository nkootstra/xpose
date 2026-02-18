import { CopyBodyButton } from '../shared/copy-button'

interface FormRendererProps {
  /** The raw `application/x-www-form-urlencoded` body string. */
  body: string
}

/**
 * Renders a URL-encoded form body as a key → value table.
 *
 * Reuses the same visual style as the headers table in the inspect dashboard
 * for a consistent look.
 */
export function FormRenderer({ body }: FormRendererProps) {
  const params = new URLSearchParams(body)
  const entries = Array.from(params.entries())

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <CopyBodyButton text={body} />
      </div>

      {entries.length === 0 ? (
        <span className="text-sm text-gray-500">Empty body</span>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {entries.map(([key, value], i) => (
              <tr
                key={`${key}-${i}`}
                className="border-b border-white/5 last:border-0"
              >
                <td className="py-1 pr-3 align-top font-mono whitespace-nowrap text-blue-400">
                  {key}
                </td>
                <td className="py-1 font-mono text-gray-300 break-all">
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
