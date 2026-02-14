'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, MapPin, Home, ArrowRight } from 'lucide-react'
import { searchAutocomplete } from '@/lib/api/properties'
import type { SearchSuggestion } from '@/types/property'

export function SearchBar() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const debounceTimer = useRef<NodeJS.Timeout>()
  const requestSeq = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([])
      setIsOpen(false)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setIsOpen(true)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)

    const seq = ++requestSeq.current
    debounceTimer.current = setTimeout(async () => {
      try {
        const results = await searchAutocomplete(query)
        if (seq !== requestSeq.current) return
        setSuggestions(results)
        setIsOpen(true)
      } finally {
        if (seq === requestSeq.current) {
          setIsLoading(false)
        }
      }
    }, 300)

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [query])

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
      fetch('/api/search/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'search_submit', query: query.trim() }),
        keepalive: true,
      }).catch(() => {})
      router.push(`/search?q=${encodeURIComponent(query.trim())}`)
      setIsOpen(false)
      setSuggestions([])
    }
  }

  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    const currentQuery = query
    fetch('/api/search/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'autocomplete_select',
        query: currentQuery,
        suggestion: {
          type: suggestion.type,
          id: suggestion.id,
          name: suggestion.name,
        },
      }),
      keepalive: true,
    }).catch(() => {})

    if (suggestion.type === 'property' && suggestion.id) {
      router.push(`/property/${suggestion.id}`)
    } else if (suggestion.type === 'complex' && suggestion.id) {
      router.push(`/complex/${suggestion.id}`)
    } else if (suggestion.type === 'region' && suggestion.id) {
      router.push(
        `/search?region=${suggestion.id}&sigungu=${encodeURIComponent(suggestion.name)}`
      )
    } else {
      router.push(`/search?q=${encodeURIComponent(suggestion.name)}`)
    }
    setIsOpen(false)
    setQuery('')
  }

  const getIconByType = (type: string) => {
    switch (type) {
      case 'region':
        return <MapPin className="h-4 w-4 text-[#8B95A1]" />
      case 'complex':
      case 'property':
        return <Home className="h-4 w-4 text-[#8B95A1]" />
      default:
        return <Search className="h-4 w-4 text-[#8B95A1]" />
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={handleSubmit}>
        <div className="flex items-center gap-3 rounded-2xl border border-[#D1D6DB] bg-[#F9FAFB] px-5 py-3.5 transition-all focus-within:border-[#3182F6] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#3182F6]/10">
          {/* Left: Search icon */}
          <Search className="h-5 w-5 flex-shrink-0 text-[#8B95A1]" />

          {/* Center: Input */}
          <input
            type="text"
            role="combobox"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="어디에서 찾으시나요?"
            className="flex-1 bg-transparent text-base text-[#191F28] outline-none placeholder:text-[#8B95A1]"
            aria-label="매물 검색"
            aria-autocomplete="list"
            aria-controls="search-suggestions"
            aria-expanded={isOpen}
          />

          {/* Right: Submit button */}
          <button
            type="submit"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3182F6] text-white transition-colors hover:bg-[#1B64DA]"
            aria-label="검색"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* Autocomplete dropdown */}
        {isOpen && (isLoading || suggestions.length > 0) && (
          <div
            id="search-suggestions"
            role="listbox"
            className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-[#E5E8EB] bg-white shadow-lg"
          >
            {isLoading && (
              <div className="px-4 py-3 text-sm text-[#8B95A1]">검색 중...</div>
            )}
            {!isLoading &&
              suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.type}-${suggestion.id || index}`}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F9FAFB]"
                >
                  {getIconByType(suggestion.type)}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[#191F28]">
                      {suggestion.name}
                    </p>
                    {suggestion.description && (
                      <p className="text-xs text-[#8B95A1]">
                        {suggestion.description}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            {!isLoading && suggestions.length === 0 && (
              <div className="px-4 py-3 text-sm text-[#8B95A1]">
                검색 결과가 없습니다.
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  )
}
