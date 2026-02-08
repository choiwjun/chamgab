'use client'

export default function Error({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#F2F4F6]">
        <svg
          className="h-8 w-8 text-[#8B95A1]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
      </div>
      <h2 className="mb-2 text-lg font-bold text-[#191F28]">
        오류가 발생했습니다
      </h2>
      <p className="mb-6 text-sm text-[#4E5968]">
        일시적인 문제가 발생했습니다. 다시 시도해주세요.
      </p>
      <button
        onClick={reset}
        className="rounded-xl bg-[#3182F6] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1B64DA]"
      >
        다시 시도
      </button>
    </div>
  )
}
