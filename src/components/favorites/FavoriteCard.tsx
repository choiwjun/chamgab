// @TASK P4-S6-T3 - 관심 매물 카드 컴포넌트 (Editorial Luxury 스타일)
// @SPEC specs/screens/favorites.yaml

'use client'

import Link from 'next/link'
import { MapPin, Trash2, Bell, BellOff, ArrowUpRight, Maximize2, Calendar } from 'lucide-react'
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
      transition={{ delay: index * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn('group relative', className)}
    >
      <Link
        href={`/property/${property.id}`}
        className="block h-full bg-white border border-editorial-dark/5 hover:border-editorial-gold/50 transition-all duration-300 relative"
      >
        {/* 상단 골드 라인 - 호버 시 */}
        <div className="absolute top-0 left-0 w-0 h-0.5 bg-editorial-gold group-hover:w-full transition-all duration-500" />

        <div className="p-6">
          {/* 지역 태그 + 액션 버튼 */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs tracking-[0.15em] uppercase text-editorial-gold">
              {region} {subRegion}
            </span>
            <ArrowUpRight className="w-4 h-4 text-editorial-ink/20 group-hover:text-editorial-gold transition-colors" />
          </div>

          {/* 아파트명 */}
          <h3 className="font-serif text-xl text-editorial-dark leading-tight mb-2 group-hover:text-editorial-gold transition-colors line-clamp-2">
            {property.name}
          </h3>

          {/* 주소 */}
          <div className="flex items-start gap-1.5 mb-6">
            <MapPin className="w-3.5 h-3.5 text-editorial-ink/30 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-editorial-ink/50 line-clamp-1">
              {property.address}
            </p>
          </div>

          {/* 구분선 */}
          <div className="h-px bg-editorial-dark/5 mb-4" />

          {/* 상세 정보 */}
          <div className="flex items-center gap-6 mb-4">
            {property.area_exclusive && (
              <div className="flex items-center gap-2">
                <Maximize2 className="w-4 h-4 text-editorial-ink/30" />
                <span className="text-sm text-editorial-ink/70">
                  {formatArea(property.area_exclusive)}
                </span>
              </div>
            )}
            {property.built_year && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-editorial-ink/30" />
                <span className="text-sm text-editorial-ink/70">
                  {property.built_year}년
                </span>
              </div>
            )}
          </div>

          {/* 저장 날짜 */}
          <div className="text-xs text-editorial-ink/40">
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
            'flex h-8 w-8 items-center justify-center border transition-colors',
            favorite.notify_enabled
              ? 'bg-editorial-gold border-editorial-gold text-white'
              : 'bg-white border-editorial-dark/10 text-editorial-ink/50 hover:border-editorial-gold hover:text-editorial-gold'
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
          className="flex h-8 w-8 items-center justify-center bg-white border border-editorial-dark/10 text-editorial-ink/40 hover:border-red-300 hover:text-red-500 transition-colors"
          title="삭제"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </motion.button>
      </div>
    </motion.div>
  )
}
