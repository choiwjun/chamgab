'use client'

// @TASK P2-S1-T2 - 검색바 with 자동완성
// @SPEC specs/screens/home.yaml#search_bar

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, MapPin, Home } from 'lucide-react'
import { searchAutocomplete } from '@/lib/api/properties'
import type { SearchSuggestion } from '@/types/property'

export function SearchBar() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const debounceTimer = useRef<NodeJS.Timeout>()
  const containerRef = useRef<HTMLDivElement>(null)

  // 자동완성 검색 (300ms 디바운스)
  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([])
      setIsOpen(false)
      return
    }

    setIsLoading(true)

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }

    debounceTimer.current = setTimeout(async () => {
      const results = await searchAutocomplete(query)
      setSuggestions(results)
      setIsOpen(results.length > 0)
      setIsLoading(false)
    }, 300)

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }
    }
  }, [query])

  // 외부 클릭 시 자동완성 닫기
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`)
      setIsOpen(false)
    }
  }

  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    if (suggestion.type === 'property' && suggestion.id) {
      router.push(`/property/${suggestion.id}`)
    } else if (suggestion.type === 'complex' && suggestion.id) {
      router.push(`/search?complex=${suggestion.id}`)
    } else if (suggestion.type === 'region' && suggestion.id) {
      router.push(`/search?region=${suggestion.id}`)
    } else {
      router.push(`/search?q=${encodeURIComponent(suggestion.name)}`)
    }
    setIsOpen(false)
    setQuery('')
  }

  const getIconByType = (type: string) => {
    switch (type) {
      case 'region':
        return <MapPin className="h-4 w-4 text-gray-400" />
      case 'complex':
      case 'property':
        return <Home className="h-4 w-4 text-gray-400" />
      default:
        return <Search className="h-4 w-4 text-gray-400" />
    }
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl">
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative flex items-center rounded-lg bg-white shadow-lg">
          <Search className="absolute left-4 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="아파트, 지역명으로 검색"
            className="w-full rounded-lg border-none py-4 pl-12 pr-4 text-lg text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-primary"
            aria-label="매물 검색"
            aria-autocomplete="list"
            aria-controls="search-suggestions"
            aria-expanded={isOpen}
          />
        </div>

        {/* 자동완성 드롭다운 */}
        {isOpen && suggestions.length > 0 && (
          <div
            id="search-suggestions"
            role="listbox"
            className="absolute z-50 mt-2 w-full rounded-lg border border-gray-200 bg-white shadow-xl"
          >
            {isLoading && (
              <div className="px-4 py-3 text-sm text-gray-500">검색 중...</div>
            )}

            {!isLoading &&
              suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.type}-${suggestion.id || index}`}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-gray-50"
                >
                  {getIconByType(suggestion.type)}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {suggestion.name}
                    </p>
                    {suggestion.description && (
                      <p className="text-xs text-gray-500">
                        {suggestion.description}
                      </p>
                    )}
                  </div>
                </button>
              ))}
          </div>
        )}
      </form>
    </div>
  )
}
