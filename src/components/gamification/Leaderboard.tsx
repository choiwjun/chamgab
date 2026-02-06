// @TASK P6-S3 - Leaderboard UI Component
// @SPEC docs/planning/phase-6-advancement.md#리더보드
'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Crown, TrendingUp, Award, Users } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_ML_API_URL || 'http://localhost:8002'

// Types
interface LeaderboardEntry {
  rank: number
  user_id: string
  nickname: string
  total_points: number
  level: number
  level_name: string
  badge_count: number
  top_badge: string | null
  weekly_points: number
}

interface LeaderboardResponse {
  period: string
  entries: LeaderboardEntry[]
  total_participants: number
}

interface UserRank {
  user_id: string
  nickname: string
  rank: number
  total_points: number
  level: number
  level_name: string
  percentile: number
}

interface LeaderboardProps {
  userId?: string
}

type CategoryType = 'weekly' | 'analysis' | 'commercial' | 'investment'

const CATEGORIES = [
  { id: 'weekly' as CategoryType, label: '주간 랭킹', icon: TrendingUp },
  { id: 'analysis' as CategoryType, label: '분석 전문가', icon: Award },
  { id: 'commercial' as CategoryType, label: '상권 전문가', icon: Users },
  { id: 'investment' as CategoryType, label: '투자 전문가', icon: Crown },
]

const LEVEL_COLORS = {
  1: 'bg-green-100 text-green-700 border-green-300',
  2: 'bg-blue-100 text-blue-700 border-blue-300',
  3: 'bg-purple-100 text-purple-700 border-purple-300',
  4: 'bg-orange-100 text-orange-700 border-orange-300',
  5: 'bg-red-100 text-red-700 border-red-300',
}

const RANK_STYLES = {
  1: {
    bg: 'bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-400',
    emoji: '👑',
    label: '1st',
  },
  2: {
    bg: 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-400',
    emoji: '🥈',
    label: '2nd',
  },
  3: {
    bg: 'bg-gradient-to-r from-orange-50 to-amber-50 border-orange-400',
    emoji: '🥉',
    label: '3rd',
  },
}

export default function Leaderboard({ userId }: LeaderboardProps) {
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryType>('weekly')

  // Fetch leaderboard data
  const {
    data: leaderboard,
    isLoading,
    error,
  } = useQuery<LeaderboardResponse>({
    queryKey: ['leaderboard', selectedCategory],
    queryFn: async () => {
      const endpoint =
        selectedCategory === 'weekly'
          ? `${API_URL}/api/gamification/leaderboard/weekly`
          : `${API_URL}/api/gamification/leaderboard/category/${selectedCategory}`

      const res = await fetch(endpoint)
      if (!res.ok) throw new Error('Failed to fetch leaderboard')
      return res.json()
    },
  })

  // Fetch current user rank
  const { data: userRank } = useQuery<UserRank>({
    queryKey: ['userRank', userId],
    queryFn: async () => {
      if (!userId) return null
      const res = await fetch(
        `${API_URL}/api/gamification/users/${userId}/rank`
      )
      if (!res.ok) throw new Error('Failed to fetch user rank')
      return res.json()
    },
    enabled: !!userId,
  })

  const getLevelColor = (level: number) => {
    return LEVEL_COLORS[level as keyof typeof LEVEL_COLORS] || LEVEL_COLORS[1]
  }

  const formatPoints = (points: number) => {
    return points.toLocaleString('ko-KR')
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 p-12">
        <Crown className="mb-4 h-12 w-12 text-red-400" />
        <p className="font-medium text-red-700">
          리더보드를 불러올 수 없습니다
        </p>
        <p className="mt-1 text-sm text-red-600">잠시 후 다시 시도해주세요</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Crown className="h-8 w-8 text-amber-600" />
        <h2 className="text-2xl font-bold text-gray-900">리더보드</h2>
      </div>

      {/* Category Tabs */}
      <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-2">
        {CATEGORIES.map((category) => {
          const Icon = category.icon
          return (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                selectedCategory === category.id
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } `}
            >
              <Icon className="h-4 w-4" />
              {category.label}
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <>
          {/* My Rank Card */}
          {userId && userRank && (
            <div className="rounded-xl border-2 border-indigo-300 bg-indigo-50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="mb-1 text-sm font-medium text-indigo-600">
                    내 순위
                  </p>
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl font-bold text-indigo-900">
                      #{userRank.rank}
                    </span>
                    <span className="text-sm text-indigo-700">
                      상위 {userRank.percentile}%
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="mb-1 text-sm text-indigo-600">총 포인트</p>
                  <p className="text-2xl font-bold text-indigo-900">
                    {formatPoints(userRank.total_points)}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${getLevelColor(userRank.level)}`}
                >
                  Lv.{userRank.level} {userRank.level_name}
                </span>
                <span className="text-sm text-indigo-700">
                  당신은 상위 {userRank.percentile}%입니다! 🎉
                </span>
              </div>
            </div>
          )}

          {/* Top 3 Podium */}
          {leaderboard && leaderboard.entries.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {leaderboard.entries.slice(0, 3).map((entry) => {
                const rankStyle =
                  RANK_STYLES[entry.rank as keyof typeof RANK_STYLES]
                const isCurrentUser = userId === entry.user_id

                return (
                  <div
                    key={entry.user_id}
                    className={`rounded-xl border-2 p-6 ${isCurrentUser ? 'border-indigo-300 bg-indigo-50' : rankStyle.bg} ${entry.rank === 1 ? 'md:col-span-3 md:row-start-1' : ''} transition-all duration-200 hover:shadow-lg`}
                  >
                    <div className="text-center">
                      <div className="mb-2 text-4xl">{rankStyle.emoji}</div>
                      <div className="mb-1 text-sm font-medium text-gray-600">
                        {rankStyle.label} Place
                      </div>
                      <h3 className="mb-2 text-xl font-bold text-gray-900">
                        {entry.nickname}
                      </h3>
                      <div className="mb-3 flex items-center justify-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${getLevelColor(entry.level)}`}
                        >
                          Lv.{entry.level} {entry.level_name}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <p className="text-sm text-gray-600">총 포인트</p>
                          <p className="text-2xl font-bold text-gray-900">
                            {formatPoints(entry.total_points)}
                          </p>
                        </div>
                        <div className="flex justify-center gap-4 text-sm">
                          <div>
                            <p className="text-gray-600">주간 포인트</p>
                            <p className="font-semibold text-indigo-600">
                              +{formatPoints(entry.weekly_points)}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600">뱃지</p>
                            <p className="font-semibold text-amber-600">
                              {entry.badge_count}개
                            </p>
                          </div>
                        </div>
                        {entry.top_badge && (
                          <div className="mt-2 rounded-lg bg-white bg-opacity-50 px-3 py-1">
                            <p className="text-xs text-gray-600">대표 뱃지</p>
                            <p className="text-sm font-medium text-gray-800">
                              {entry.top_badge}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Ranking List (4th-10th) */}
          {leaderboard && leaderboard.entries.length > 3 && (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                        순위
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                        닉네임
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                        레벨
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600">
                        총 포인트
                      </th>
                      <th className="hidden px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600 sm:table-cell">
                        주간 포인트
                      </th>
                      <th className="hidden px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-600 md:table-cell">
                        뱃지
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {leaderboard.entries.slice(3).map((entry) => {
                      const isCurrentUser = userId === entry.user_id
                      return (
                        <tr
                          key={entry.user_id}
                          className={` ${isCurrentUser ? 'border-indigo-300 bg-indigo-50' : 'hover:bg-gray-50'} transition-colors duration-150`}
                        >
                          <td className="whitespace-nowrap px-6 py-4">
                            <span className="text-lg font-bold text-gray-900">
                              #{entry.rank}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4">
                            <span className="font-medium text-gray-900">
                              {entry.nickname}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4">
                            <span
                              className={`rounded-full border px-2 py-1 text-xs font-medium ${getLevelColor(entry.level)}`}
                            >
                              Lv.{entry.level}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-right">
                            <span className="font-semibold text-gray-900">
                              {formatPoints(entry.total_points)}
                            </span>
                          </td>
                          <td className="hidden whitespace-nowrap px-6 py-4 text-right sm:table-cell">
                            <span className="font-medium text-indigo-600">
                              +{formatPoints(entry.weekly_points)}
                            </span>
                          </td>
                          <td className="hidden whitespace-nowrap px-6 py-4 text-right md:table-cell">
                            <span className="font-medium text-amber-600">
                              {entry.badge_count}개
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Period Info */}
          {leaderboard && (
            <div className="py-4 text-center text-sm text-gray-600">
              <p>
                {leaderboard.period} | 이번 주 참여자:{' '}
                <span className="font-semibold text-gray-900">
                  {leaderboard.total_participants.toLocaleString('ko-KR')}명
                </span>
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Loading Skeleton Component
function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Top 3 Skeleton */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-64 rounded-xl border-2 border-gray-200 bg-gray-100 p-6"
          />
        ))}
      </div>

      {/* List Skeleton */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="space-y-3 p-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-gray-100" />
          ))}
        </div>
      </div>
    </div>
  )
}
