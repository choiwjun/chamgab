// @TASK P1-S0-T2 - 모달 다이얼로그 컴포넌트
// @SPEC specs/shared/components.yaml#modal

'use client'

import { ReactNode, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface ModalProps {
  /**
   * 모달 표시 여부
   */
  isOpen: boolean
  /**
   * 모달 닫기 핸들러
   */
  onClose: () => void
  /**
   * 모달 제목
   */
  title?: string
  /**
   * 모달 콘텐츠
   */
  children: ReactNode
  /**
   * 액션 버튼 영역
   */
  actions?: ReactNode
  /**
   * X 버튼으로 닫기 가능 여부 (기본: true)
   */
  closable?: boolean
  /**
   * 백드롭 클릭으로 닫기 가능 여부 (기본: true)
   */
  closeOnBackdropClick?: boolean
  /**
   * 최대 너비 (기본: '2xl')
   */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl'
}

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  actions,
  closable = true,
  closeOnBackdropClick = true,
  maxWidth = '2xl',
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  // ESC 키로 닫기
  useEffect(() => {
    if (!isOpen || !closable) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, closable, onClose])

  // 포커스 트랩
  useEffect(() => {
    if (!isOpen) return

    const focusableElements = modalRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )

    if (focusableElements && focusableElements.length > 0) {
      ;(focusableElements[0] as HTMLElement).focus()
    }
  }, [isOpen])

  // body 스크롤 방지
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdropClick && closable && e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'modal-title' : undefined}
        >
          {/* 백드롭 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleBackdropClick}
            aria-hidden="true"
          />

          {/* 모달 콘텐츠 */}
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className={`relative rounded-xl bg-white shadow-sm ${maxWidthClasses[maxWidth]} flex max-h-[90vh] w-full flex-col`}
          >
            {/* 헤더 */}
            {(title || closable) && (
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                {title && (
                  <h2
                    id="modal-title"
                    className="text-lg font-semibold text-gray-900"
                  >
                    {title}
                  </h2>
                )}
                {closable && (
                  <button
                    onClick={onClose}
                    className="ml-auto rounded-lg p-2 transition-colors hover:bg-gray-100"
                    aria-label="모달 닫기"
                  >
                    <X className="h-5 w-5 text-gray-500" aria-hidden="true" />
                  </button>
                )}
              </div>
            )}

            {/* 콘텐츠 */}
            <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>

            {/* 액션 버튼 */}
            {actions && (
              <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
                {actions}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

// 편의 컴포넌트: 확인 모달
interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'primary'
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  variant = 'primary',
}: ConfirmModalProps) {
  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  const confirmButtonClass =
    variant === 'danger'
      ? 'bg-red-500 hover:bg-red-600 text-white'
      : 'bg-blue-500 hover:bg-blue-600 text-white'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="md"
      actions={
        <>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            className={`rounded-lg px-4 py-2 font-medium transition-colors ${confirmButtonClass}`}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-gray-700">{message}</p>
    </Modal>
  )
}
