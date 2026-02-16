import { createContext, useContext, useId, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { SPRING_POP } from '@/lib/constants'

interface TabsContextValue {
  activeTab: string
  setActiveTab: (value: string) => void
  layoutId: string
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabsContext() {
  const context = useContext(TabsContext)
  if (!context) {
    throw new Error('Tabs components must be used within Tabs')
  }
  return context
}

interface TabsProps {
  defaultValue: string
  children: ReactNode
  className?: string
}

export function Tabs({ defaultValue, children, className }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultValue)
  const layoutId = useId()

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab, layoutId }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

interface TabsListProps {
  children: ReactNode
  className?: string
}

export function TabsList({ children, className }: TabsListProps) {
  return (
    <div
      role="tablist"
      className={`inline-flex items-center gap-1 rounded-lg border border-gray-800 bg-gray-900 p-1 ${className ?? ''}`}
    >
      {children}
    </div>
  )
}

interface TabsTriggerProps {
  value: string
  children: ReactNode
  className?: string
}

export function TabsTrigger({ value, children, className }: TabsTriggerProps) {
  const { activeTab, setActiveTab, layoutId } = useTabsContext()
  const isActive = activeTab === value

  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={() => setActiveTab(value)}
      className={`relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        isActive ? 'text-gray-50' : 'text-gray-400 hover:text-gray-300'
      } ${className ?? ''}`}
    >
      {isActive && (
        <motion.div
          layoutId={`tab-${layoutId}`}
          className="absolute inset-0 rounded-md bg-gray-800"
          transition={SPRING_POP}
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  )
}

interface TabsContentProps {
  value: string
  children: ReactNode
  className?: string
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const { activeTab } = useTabsContext()

  if (activeTab !== value) return null

  return <div className={className}>{children}</div>
}
