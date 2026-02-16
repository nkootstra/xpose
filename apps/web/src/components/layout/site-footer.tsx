export function SiteFooter() {
  return (
    <footer className="border-t border-gray-800/50">
      <div className="mx-auto flex max-w-5xl items-center justify-center px-6 py-8">
        <p className="text-sm text-gray-400">
          &copy; {new Date().getFullYear()} xpose. MIT License.
        </p>
      </div>
    </footer>
  )
}
