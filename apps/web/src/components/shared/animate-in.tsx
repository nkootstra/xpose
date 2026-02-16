import { motion } from 'motion/react'
import { SPRING_ENTRANCE } from '@/lib/constants'

interface AnimateInProps {
  children: React.ReactNode
  delay?: number
  y?: number
  className?: string
}

export function AnimateIn({
  children,
  delay = 0,
  y = 24,
  className,
}: AnimateInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ ...SPRING_ENTRANCE, delay: delay / 1000 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
