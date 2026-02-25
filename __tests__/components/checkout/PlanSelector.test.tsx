import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanSelector } from '@/components/checkout/PlanSelector'

describe('PlanSelector quality warning policy', () => {
  it('keeps confirmation disabled until both acknowledgements are checked', async () => {
    const user = userEvent.setup()
    render(<PlanSelector />)

    const selectButtons = screen.getAllByRole('button', { name: '선택하기' })
    expect(selectButtons.length).toBeGreaterThan(0)

    await user.click(selectButtons[0]!)
    expect(
      screen.getByText('결제 전 품질 경고 및 정책 확인이 필요합니다.')
    ).toBeInTheDocument()

    const confirmButton = screen.getByRole('button', { name: '확인 후 종료' })
    const qualityCheck = screen.getByLabelText(
      '품질 경고 배지와 결과 해석 제한 안내를 확인했습니다.'
    )
    const noRefundCheck = screen.getByLabelText('무환불 정책에 동의합니다.')

    expect(confirmButton).toBeDisabled()

    await user.click(qualityCheck)
    expect(confirmButton).toBeDisabled()

    await user.click(noRefundCheck)
    expect(confirmButton).toBeEnabled()
  })
})
