// @TASK P1-S0-T2 - 하단 시트 컴포넌트 (모바일)
// @SPEC specs/shared/components.yaml#bottom-sheet

'use client'

import { ReactNode, useEffect, useRef } from 'react'
import {
  motion,
  AnimatePresence,
  PanInfo,
  useMotionValue,
  useTransform,
} from 'framer-motion'
import { X } from 'lucide-react'

interface BottomSheetProps {
  /**
   * 바텀시트 표시 여부
   */
  isOpen: boolean
  /**
   * 바텀시트 닫기 핸들러
   */
  onClose: () => void
  /**
   * 바텀시트 제목
   */
  title?: string
  /**
   * 바텀시트 콘텐츠
   */
  children: ReactNode
  /**
   * 높이 설정 (기본: 'auto')
   */
  height?: 'auto' | 'half' | 'full'
  /**
   * 드래그로 닫기 가능 여부 (기본: true)
   */
  draggable?: boolean
  /**
   * 백드롭 클릭으로 닫기 가능 여부 (기본: true)
   */
  closeOnBackdropClick?: boolean
}

const heightClasses = {
  auto: 'max-h-[90vh]',
  half: 'h-1/2',
  full: 'h-[90vh]',
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  height = 'auto',
  draggable = true,
  closeOnBackdropClick = true,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const y = useMotionValue(0)
  const opacity = useTransform(y, [0, 300], [1, 0])

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

  const handleDragEnd = (
    _: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    if (info.offset.y > 100 || info.velocity.y > 500) {
      onClose()
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdropClick && e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] md:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'bottomsheet-title' : undefined}
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

          {/* 바텀시트 콘텐츠 */}
          <motion.div
            ref={sheetRef}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            drag={draggable ? 'y' : false}
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={handleDragEnd}
            style={{ y, opacity }}
            className={`absolute bottom-0 left-0 right-0 rounded-t-2xl bg-white shadow-xl ${heightClasses[height]} flex touch-none flex-col`}
          >
            {/* 드래그 핸들 */}
            {draggable && (
              <div className="flex justify-center pb-2 pt-3">
                <div
                  className="h-1 w-12 rounded-full bg-gray-300"
                  aria-hidden="true"
                />
              </div>
            )}

            {/* 헤더 */}
            {title && (
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                <h2
                  id="bottomsheet-title"
                  className="text-lg font-semibold text-gray-900"
                >
                  {title}
                </h2>
                <button
                  onClick={onClose}
                  className="rounded-lg p-2 transition-colors hover:bg-gray-100"
                  aria-label="바텀시트 닫기"
                >
                  <X className="h-5 w-5 text-gray-500" aria-hidden="true" />
                </button>
              </div>
            )}

            {/* 콘텐츠 */}
            <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

// 편의 컴포넌트: 확인 바텀시트
interface ConfirmBottomSheetProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'primary'
}

export function ConfirmBottomSheet({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  variant = 'primary',
}: ConfirmBottomSheetProps) {
  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  const confirmButtonClass =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : 'bg-[#1E3A5F] hover:bg-[#2E5A8F] text-white'

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={title} height="auto">
      <div className="space-y-6">
        <p className="text-gray-700">{message}</p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            className={`flex-1 rounded-lg px-4 py-3 font-medium transition-colors ${confirmButtonClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
