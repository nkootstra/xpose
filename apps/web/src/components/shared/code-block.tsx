import { CopyButton } from './copy-button'

interface CodeBlockProps {
  code: string
  language?: string
}

export function CodeBlock({ code, language = 'bash' }: CodeBlockProps) {
  return (
    <div className="group relative rounded-lg border border-gray-800 bg-gray-900">
      <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
        <code className={`language-${language} text-gray-300`}>{code}</code>
      </pre>
    </div>
  )
}
