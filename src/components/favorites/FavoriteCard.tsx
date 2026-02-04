// @TASK P4-S6-T3 - 관심 매물 카드 컴포넌트
// @SPEC specs/screens/favorites.yaml

'use client'

import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Trash2, Bell, BellOff } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Favorite } from '@/types/favorite'
import { formatArea, formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface FavoriteCardProps {
  favorite: Favorite
  onDelete: (id: string) => void
  onToggleNotify: (id: string, enabled: boolean) => void
  className?: string
  index?: number
}

export function FavoriteCard({
  favorite,
  onDelete,
  onToggleNotify,
  className,
  index = 0,
}: FavoriteCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [isTogglingNotify, setIsTogglingNotify] = useState(false)

  const property = favorite.properties

  if (!property) {
    return null
  }

  const thumbnail =
    property.thumbnail ||
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="192"%3E%3Crect width="320" height="192" fill="%23f3f4f6"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="14" fill="%239ca3af"%3ENo Image%3C/text%3E%3C/svg%3E'

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (isDeleting) return

    if (!confirm('이 매물을 관심 목록에서 삭제하시겠습니까?')) return

    setIsDeleting(true)
    try {
      await onDelete(favorite.id)
    } catch (error) {
      console.error('Failed to delete favorite:', error)
      setIsDeleting(false)
    }
  }

  const handleToggleNotify = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (isTogglingNotify) return

    setIsTogglingNotify(true)
    try {
      await onToggleNotify(favorite.id, !favorite.notify_enabled)
    } catch (error) {
      console.error('Failed to toggle notify:', error)
    } finally {
      setIsTogglingNotify(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className={cn('group relative', className)}
    >
      <Link
        href={`/property/${property.id}`}
        className="block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-all hover:border-primary hover:shadow-md"
      >
        {/* 이미지 */}
        <div className="relative h-48 w-full overflow-hidden bg-gray-100">
          <Image
            src={thumbnail}
            alt={property.name}
            fill
            unoptimized={!property.thumbnail}
            className="object-cover transition-transform group-hover:scale-105"
            sizes="(max-width: 768px) 280px, 320px"
          />
        </div>

        {/* 정보 */}
        <div className="p-4">
          {/* 이름 */}
          <h3 className="mb-2 text-base font-semibold text-gray-900 line-clamp-1 group-hover:text-primary">
            {property.name}
          </h3>

          {/* 주소 */}
          <div className="mb-3 flex items-start gap-1">
            <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
            <p className="text-sm text-gray-600 line-clamp-2">
              {property.address}
            </p>
          </div>

          {/* 상세 정보 */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {property.area_exclusive && (
              <span>{formatArea(property.area_exclusive)}</span>
            )}
            {property.built_year && (
              <>
                <span>•</span>
                <span>{property.built_year}년</span>
              </>
            )}
          </div>

          {/* 저장 날짜 */}
          <div className="mt-3 text-xs text-gray-400">
            저장일: {new Date(favorite.created_at).toLocaleDateString('ko-KR')}
          </div>
        </div>
      </Link>

      {/* 액션 버튼 (절대 위치) */}
      <div className="absolute right-2 top-2 flex gap-2">
        {/* 알림 토글 */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={handleToggleNotify}
          disabled={isTogglingNotify}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full shadow-md transition-colors',
            favorite.notify_enabled
              ? 'bg-primary text-white hover:bg-primary/90'
              : 'bg-white text-gray-600 hover:bg-gray-100'
          )}
          title={favorite.notify_enabled ? '알림 끄기' : '알림 켜기'}
        >
          {favorite.notify_enabled ? (
            <Bell className="h-4 w-4" />
          ) : (
            <BellOff className="h-4 w-4" />
          )}
        </motion.button>

        {/* 삭제 버튼 */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={handleDelete}
          disabled={isDeleting}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-red-500 shadow-md transition-colors hover:bg-red-50"
          title="삭제"
        >
          <Trash2 className="h-4 w-4" />
        </motion.button>
      </div>
    </motion.div>
  )
}
