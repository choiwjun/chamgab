// @TASK P4-S6-T3 - 관심 매물 카드 컴포넌트 (Editorial Luxury 스타일)
// @SPEC specs/screens/favorites.yaml

'use client'

import Link from 'next/link'
import {
  MapPin,
  Trash2,
  Bell,
  BellOff,
  ArrowUpRight,
  Maximize2,
  Calendar,
} from 'lucide-react'
import { motion } from 'framer-motion'
import type { Favorite } from '@/types/favorite'
import { formatArea } from '@/lib/format'
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

  const region = property.address?.split(' ')[0] || '서울'
  const subRegion = property.address?.split(' ')[1] || ''

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
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      exit={{ opacity: 0, x: -100 }}
      transition={{
        delay: index * 0.08,
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn('group relative', className)}
    >
      <Link
        href={`/property/${property.id}`}
        className="relative block h-full rounded-xl border border-[#E5E8EB] bg-white transition-all duration-300 hover:border-[#3182F6]/30"
      >
        <div className="p-6">
          {/* 지역 태그 + 액션 버튼 */}
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs font-medium text-[#8B95A1]">
              {region} {subRegion}
            </span>
            <ArrowUpRight className="h-4 w-4 text-[#8B95A1] transition-colors group-hover:text-[#3182F6]" />
          </div>

          {/* 아파트명 */}
          <h3 className="mb-2 line-clamp-2 text-xl font-semibold leading-tight text-[#191F28] transition-colors group-hover:text-[#3182F6]">
            {property.name}
          </h3>

          {/* 주소 */}
          <div className="mb-6 flex items-start gap-1.5">
            <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#8B95A1]" />
            <p className="line-clamp-1 text-sm text-[#4E5968]">
              {property.address}
            </p>
          </div>

          {/* 구분선 */}
          <div className="mb-4 h-px bg-[#E5E8EB]" />

          {/* 상세 정보 */}
          <div className="mb-4 flex items-center gap-6">
            {property.area_exclusive && (
              <div className="flex items-center gap-2">
                <Maximize2 className="h-4 w-4 text-[#8B95A1]" />
                <span className="text-sm text-[#4E5968]">
                  {formatArea(property.area_exclusive)}
                </span>
              </div>
            )}
            {property.built_year && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#8B95A1]" />
                <span className="text-sm text-[#4E5968]">
                  {property.built_year}년
                </span>
              </div>
            )}
          </div>

          {/* 저장 날짜 */}
          <div className="text-xs text-[#8B95A1]">
            저장일: {new Date(favorite.created_at).toLocaleDateString('ko-KR')}
          </div>
        </div>
      </Link>

      {/* 액션 버튼 (절대 위치) */}
      <div className="absolute right-4 top-4 flex gap-2">
        {/* 알림 토글 */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleToggleNotify}
          disabled={isTogglingNotify}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg border transition-colors',
            favorite.notify_enabled
              ? 'border-[#3182F6] bg-[#3182F6] text-white'
              : 'border-[#E5E8EB] bg-white text-[#8B95A1] hover:border-[#3182F6] hover:text-[#3182F6]'
          )}
          title={favorite.notify_enabled ? '알림 끄기' : '알림 켜기'}
        >
          {favorite.notify_enabled ? (
            <Bell className="h-3.5 w-3.5" />
          ) : (
            <BellOff className="h-3.5 w-3.5" />
          )}
        </motion.button>

        {/* 삭제 버튼 */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleDelete}
          disabled={isDeleting}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E5E8EB] bg-white text-[#8B95A1] transition-colors hover:border-[#F04452] hover:text-[#F04452]"
          title="삭제"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </motion.button>
      </div>
    </motion.div>
  )
}
