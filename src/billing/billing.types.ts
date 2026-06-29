export type MoyasarEventType =
  | 'payment_paid'
  | 'payment_failed'
  | 'payment_refunded'
  | 'invoice_paid'
  | 'invoice_expired';

export type MoyasarPaymentStatus = 'initiated' | 'paid' | 'failed' | 'refunded';

export interface MoyasarPaymentSource {
  type: 'creditcard' | 'applepay' | 'stcpay';
  company?: 'mada' | 'visa' | 'mastercard' | 'amex';
  transaction_url?: string;
  message?: string;
}

export interface MoyasarPayment {
  id: string;
  status: MoyasarPaymentStatus;
  amount: number;
  currency: 'SAR';
  source: MoyasarPaymentSource;
  metadata: { tenant_id: string; plan_code: string; cycle: string };
}

export interface MoyasarWebhookEvent {
  id: string;
  type: MoyasarEventType;
  created_at: string;
  secret_token: string;
  data: MoyasarPayment;
}

export interface CreatePaymentInput {
  amount: number; // minor units
  givenId: string; // UUID for idempotency
  callbackUrl: string;
  metadata: { tenant_id: string; plan_code: string; cycle: string };
  description: string;
}
