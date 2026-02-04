'use client'

// @TASK P3-S4-T2 - 이미지 갤러리
import { useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, X, Expand } from 'lucide-react'

interface ImageGalleryProps {
  images: string[]
  alt: string
}

export function ImageGallery({ images, alt }: ImageGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)

  // 이미지가 없을 때 placeholder (SVG data URI)
  const placeholderImage =
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="600"%3E%3Crect width="800" height="600" fill="%23f3f4f6"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="24" fill="%239ca3af"%3E이미지 없음%3C/text%3E%3C/svg%3E'
  const displayImages = images.length > 0 ? images : [placeholderImage]

  const goToPrevious = () => {
    setCurrentIndex((prev) =>
      prev === 0 ? displayImages.length - 1 : prev - 1
    )
  }

  const goToNext = () => {
    setCurrentIndex((prev) =>
      prev === displayImages.length - 1 ? 0 : prev + 1
    )
  }

  return (
    <>
      {/* 메인 갤러리 */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-gray-100">
        {/* 이미지 */}
        <div className="relative h-full w-full">
          {displayImages[currentIndex] ? (
            <Image
              src={displayImages[currentIndex]}
              alt={`${alt} - ${currentIndex + 1}`}
              fill
              className="object-cover"
              priority={currentIndex === 0}
              unoptimized={displayImages[currentIndex].startsWith('data:')}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gray-200">
              <span className="text-gray-400">이미지 없음</span>
            </div>
          )}
        </div>

        {/* 네비게이션 버튼 */}
        {displayImages.length > 1 && (
          <>
            <button
              onClick={goToPrevious}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={goToNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        {/* 확대 버튼 */}
        <button
          onClick={() => setIsLightboxOpen(true)}
          className="absolute right-2 top-2 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70"
        >
          <Expand className="h-4 w-4" />
        </button>

        {/* 인디케이터 */}
        {displayImages.length > 1 && (
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {displayImages.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`h-2 w-2 rounded-full transition ${
                  index === currentIndex
                    ? 'bg-white'
                    : 'bg-white/50 hover:bg-white/75'
                }`}
              />
            ))}
          </div>
        )}

        {/* 카운터 */}
        <div className="absolute bottom-3 right-3 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white">
          {currentIndex + 1} / {displayImages.length}
        </div>
      </div>

      {/* 썸네일 리스트 */}
      {displayImages.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
          {displayImages.map((image, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 ${
                index === currentIndex ? 'border-primary' : 'border-transparent'
              }`}
            >
              <Image
                src={image}
                alt={`${alt} 썸네일 ${index + 1}`}
                fill
                className="object-cover"
                unoptimized={image.startsWith('data:')}
              />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox 모달 */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setIsLightboxOpen(false)}
        >
          <button
            onClick={() => setIsLightboxOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="h-6 w-6" />
          </button>

          <div
            className="relative h-[80vh] w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={displayImages[currentIndex]}
              alt={`${alt} - ${currentIndex + 1}`}
              fill
              className="object-contain"
              unoptimized={displayImages[currentIndex].startsWith('data:')}
            />

            {displayImages.length > 1 && (
              <>
                <button
                  onClick={goToPrevious}
                  className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
                >
                  <ChevronLeft className="h-8 w-8" />
                </button>
                <button
                  onClick={goToNext}
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
                >
                  <ChevronRight className="h-8 w-8" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
