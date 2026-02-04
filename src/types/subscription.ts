// @TASK P4-S11 - 구독/결제 타입 정의
// @SPEC specs/screens/checkout-plans.yaml

export type PlanId = 'free' | 'premium_monthly' | 'premium_yearly' | 'business'

export type BillingPeriod = 'monthly' | 'yearly'

export interface PlanFeature {
  name: string
  value?: string
  included: boolean
}

export interface Plan {
  id: PlanId
  name: string
  price: number
  currency: string
  period: 'month' | 'year'
  originalPrice?: number
  discountRate?: number
  features: PlanFeature[]
  isRecommended: boolean
  badge?: string
  cta: string
}

export interface Subscription {
  id: string
  userId: string
  planId: PlanId
  status: 'active' | 'cancelled' | 'past_due' | 'trialing'
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  createdAt: string
  updatedAt: string
}

export interface PaymentSession {
  paymentUrl: string
  orderId: string
  amount: number
  planId: PlanId
}
