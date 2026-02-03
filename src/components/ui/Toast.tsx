// @TASK P1-S0-T2 - 토스트 알림 컴포넌트
// @SPEC specs/shared/components.yaml#toast

'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertCircle, XCircle, Info, X } from 'lucide-react'
import { create } from 'zustand'

export type ToastType = 'success' | 'warning' | 'error' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

interface ToastStore {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random()}`
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }))
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },
}))

// 편의 함수
export const toast = {
  success: (message: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'success', message, duration }),
  warning: (message: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'warning', message, duration }),
  error: (message: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'error', message, duration }),
  info: (message: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'info', message, duration }),
}

const toastConfig: Record<
  ToastType,
  { icon: typeof CheckCircle; bgColor: string; iconColor: string; borderColor: string }
> = {
  success: {
    icon: CheckCircle,
    bgColor: 'bg-green-50',
    iconColor: 'text-green-600',
    borderColor: 'border-green-200',
  },
  warning: {
    icon: AlertCircle,
    bgColor: 'bg-amber-50',
    iconColor: 'text-amber-600',
    borderColor: 'border-amber-200',
  },
  error: {
    icon: XCircle,
    bgColor: 'bg-red-50',
    iconColor: 'text-red-600',
    borderColor: 'border-red-200',
  },
  info: {
    icon: Info,
    bgColor: 'bg-blue-50',
    iconColor: 'text-blue-600',
    borderColor: 'border-blue-200',
  },
}

function ToastItem({ toast: toastData }: { toast: Toast }) {
  const { removeToast } = useToastStore()
  const config = toastConfig[toastData.type]
  const Icon = config.icon

  useEffect(() => {
    const duration = toastData.duration ?? 3000
    if (duration > 0) {
      const timer = setTimeout(() => {
        removeToast(toastData.id)
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [toastData.id, toastData.duration, removeToast])

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={`
        flex items-start gap-3 p-4 rounded-lg border shadow-lg
        ${config.bgColor} ${config.borderColor}
        max-w-md w-full
      `}
      role="alert"
      aria-live="polite"
    >
      <Icon className={`w-5 h-5 flex-shrink-0 ${config.iconColor}`} aria-hidden="true" />

      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 break-words">{toastData.message}</p>
        {toastData.action && (
          <button
            onClick={toastData.action.onClick}
            className={`mt-2 text-sm font-medium ${config.iconColor} hover:underline`}
          >
            {toastData.action.label}
          </button>
        )}
      </div>

      <button
        onClick={() => removeToast(toastData.id)}
        className="flex-shrink-0 p-1 rounded hover:bg-white/50 transition-colors"
        aria-label="알림 닫기"
      >
        <X className="w-4 h-4 text-gray-500" aria-hidden="true" />
      </button>
    </motion.div>
  )
}

export function ToastContainer() {
  const { toasts } = useToastStore()

  return (
    <div
      className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  )
}
