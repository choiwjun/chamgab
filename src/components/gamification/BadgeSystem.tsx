'use client'

import { useQuery } from '@tanstack/react-query'
import { Trophy, Award, CheckCircle2, Lock } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_ML_API_URL || 'http://localhost:8002'

interface Badge {
  id: string
  name: string
  description: string
  icon: string
  category: string
  condition_type: string
  condition_value: number
  points_reward: number
}

interface UserBadge {
  badge_id: string
  badge: Badge
  earned: boolean
  earned_at: string | null
  progress_current: number
  progress_target: number
}

interface UserBadgeResponse {
  user_id: string
  total_points: number
  level: number
  level_name: string
  badges: UserBadge[]
  stats: {
    total_earned: number
    total_available: number
    completion_rate: number
  }
}

interface BadgeSystemProps {
  userId: string
}

const LEVEL_THRESHOLDS = [
  { level: 1, min: 0, max: 99, name: '새싹', color: 'bg-green-500' },
  { level: 2, min: 100, max: 299, name: '탐색자', color: 'bg-blue-500' },
  { level: 3, min: 300, max: 599, name: '분석가', color: 'bg-purple-500' },
  { level: 4, min: 600, max: 999, name: '전문가', color: 'bg-orange-500' },
  { level: 5, min: 1000, max: Infinity, name: '마스터', color: 'bg-red-500' },
]

function getLevelInfo(points: number) {
  const currentLevel =
    LEVEL_THRESHOLDS.find((l) => points >= l.min && points <= l.max) ||
    LEVEL_THRESHOLDS[0]

  const nextLevel = LEVEL_THRESHOLDS.find(
    (l) => l.level === currentLevel.level + 1
  )

  return {
    currentLevel,
    nextLevel,
    currentLevelProgress: points - currentLevel.min,
    nextLevelPoints: nextLevel ? nextLevel.min : currentLevel.max,
    progressToNext: nextLevel
      ? ((points - currentLevel.min) / (nextLevel.min - currentLevel.min)) * 100
      : 100,
  }
}

function formatDate(dateString: string | null) {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function BadgeSystem({ userId }: BadgeSystemProps) {
  const { data, isLoading, error } = useQuery<UserBadgeResponse>({
    queryKey: ['badges', userId],
    queryFn: async () => {
      const response = await fetch(
        `${API_URL}/api/gamification/users/${userId}/badges`
      )
      if (!response.ok) {
        throw new Error('배지 정보를 불러오는데 실패했습니다')
      }
      return response.json()
    },
  })

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-20 rounded-lg bg-gray-200" />
        <div className="h-16 rounded-lg bg-gray-200" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-48 rounded-lg bg-gray-200" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="font-medium text-red-600">
          {error instanceof Error
            ? error.message
            : '배지 정보를 불러올 수 없습니다'}
        </p>
      </div>
    )
  }

  const levelInfo = getLevelInfo(data.total_points)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 p-6 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Trophy className="h-8 w-8" />
            <div>
              <h2 className="text-2xl font-bold">배지 컬렉션</h2>
              <p className="text-sm text-amber-100">나만의 성취 기록</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{data.total_points}</div>
            <div className="text-sm text-amber-100">포인트</div>
          </div>
        </div>

        {/* Level Badge */}
        <div className="mt-4 flex items-center gap-2">
          <div
            className={`${levelInfo.currentLevel.color} rounded-full px-4 py-2 text-sm font-bold text-white shadow-md`}
          >
            Level {levelInfo.currentLevel.level} - {levelInfo.currentLevel.name}
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-amber-500" />
            <span className="font-semibold text-gray-700">
              획득한 배지: {data.stats.total_earned} /{' '}
              {data.stats.total_available}
            </span>
          </div>
          <span className="text-sm text-gray-600">
            {data.stats.completion_rate.toFixed(1)}% 달성
          </span>
        </div>

        {/* Completion Progress Bar */}
        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-yellow-500 transition-all duration-500 ease-out"
            style={{ width: `${data.stats.completion_rate}%` }}
          />
        </div>
      </div>

      {/* Badge Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {data.badges.map((userBadge) => {
          const badge = userBadge.badge
          const isEarned = userBadge.earned
          const progressPercent =
            userBadge.progress_target > 0
              ? (userBadge.progress_current / userBadge.progress_target) * 100
              : 0

          return (
            <div
              key={badge.id}
              className={`relative rounded-lg border-2 p-4 transition-all duration-300 hover:scale-105 hover:shadow-lg ${
                isEarned
                  ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50 shadow-md'
                  : 'border-gray-200 bg-gray-50 opacity-75'
              } `}
            >
              {/* Earned Checkmark */}
              {isEarned && (
                <div className="absolute right-2 top-2">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
              )}

              {/* Lock Icon for Unearned */}
              {!isEarned && (
                <div className="absolute right-2 top-2">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
              )}

              {/* Badge Icon */}
              <div className="mb-3 text-center">
                <div className={`text-5xl ${!isEarned && 'grayscale'}`}>
                  {badge.icon}
                </div>
              </div>

              {/* Badge Info */}
              <div className="space-y-2">
                <h3
                  className={`text-center text-sm font-bold ${isEarned ? 'text-gray-900' : 'text-gray-600'}`}
                >
                  {badge.name}
                </h3>
                <p
                  className={`line-clamp-2 text-center text-xs ${isEarned ? 'text-gray-700' : 'text-gray-500'}`}
                >
                  {badge.description}
                </p>

                {/* Progress Bar for Unearned Badges */}
                {!isEarned && userBadge.progress_target > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>{userBadge.progress_current}</span>
                      <span>{userBadge.progress_target}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-300">
                      <div
                        className="h-full bg-blue-500 transition-all duration-500"
                        style={{ width: `${Math.min(progressPercent, 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Earned Date */}
                {isEarned && userBadge.earned_at && (
                  <p className="text-center text-xs font-medium text-amber-700">
                    {formatDate(userBadge.earned_at)}
                  </p>
                )}

                {/* Points Reward */}
                <div
                  className={`rounded-full py-1 text-center text-xs font-semibold ${
                    isEarned
                      ? 'bg-amber-200 text-amber-800'
                      : 'bg-gray-200 text-gray-600'
                  } `}
                >
                  +{badge.points_reward} 포인트
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Point System Section */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-800">
          <Trophy className="h-5 w-5 text-amber-500" />
          레벨 시스템
        </h3>

        {/* Current Level Progress */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">
              현재 진행도
            </span>
            <span className="text-sm text-gray-600">
              {data.total_points} / {levelInfo.nextLevelPoints} 포인트
            </span>
          </div>
          <div className="h-4 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className={`${levelInfo.currentLevel.color} h-full transition-all duration-500 ease-out`}
              style={{ width: `${Math.min(levelInfo.progressToNext, 100)}%` }}
            />
          </div>
          {levelInfo.nextLevel && (
            <p className="mt-2 text-center text-xs text-gray-600">
              다음 레벨까지 {levelInfo.nextLevelPoints - data.total_points}{' '}
              포인트 남음
            </p>
          )}
        </div>

        {/* Level List */}
        <div className="space-y-3">
          {LEVEL_THRESHOLDS.map((level) => (
            <div
              key={level.level}
              className={`flex items-center justify-between rounded-lg border-2 p-3 transition-all ${
                data.level === level.level
                  ? 'border-amber-400 bg-amber-50 shadow-sm'
                  : 'border-gray-200 bg-gray-50'
              } ${data.level < level.level && 'opacity-60'} `}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`${level.color} flex h-10 w-10 items-center justify-center rounded-full font-bold text-white shadow-md`}
                >
                  {level.level}
                </div>
                <div>
                  <div className="font-bold text-gray-800">{level.name}</div>
                  <div className="text-xs text-gray-600">
                    {level.min}
                    {level.max === Infinity ? '+' : `-${level.max}`} 포인트
                  </div>
                </div>
              </div>
              {data.level === level.level && (
                <div className="rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white">
                  현재 레벨
                </div>
              )}
              {data.level > level.level && (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
