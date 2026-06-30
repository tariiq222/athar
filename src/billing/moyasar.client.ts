import { Injectable } from '@nestjs/common';
import { MoyasarPayment, CreatePaymentInput } from './billing.types';
import { AppError } from '../common/errors/error-envelope';

interface MoyasarConfig {
  secretKey: string;
  baseUrl: string;
}

@Injectable()
export class MoyasarClient {
  constructor(private readonly config: MoyasarConfig) {}

  static fromSecret(secretKey: string, baseUrl = 'https://api.moyasar.com/v1'): MoyasarClient {
    return new MoyasarClient({ secretKey, baseUrl });
  }

  private authHeader(): string {
    return 'Basic ' + Buffer.from(`${this.config.secretKey}:`).toString('base64');
  }

  async createPaymentIntent(input: CreatePaymentInput): Promise<MoyasarPayment> {
    const body = {
      amount: input.amount,
      currency: 'SAR',
      description: input.description,
      callback_url: input.callbackUrl,
      given_id: input.givenId,
      metadata: input.metadata,
      source: { type: 'creditcard' },
    };
    const res = await fetch(`${this.config.baseUrl}/payments`, {
      method: 'POST',
      headers: { Authorization: this.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.parse(res);
  }

  async fetchPayment(id: string): Promise<MoyasarPayment> {
    const res = await fetch(`${this.config.baseUrl}/payments/${encodeURIComponent(id)}`, {
      headers: { Authorization: this.authHeader() },
    });
    return this.parse(res);
  }

  private async parse(res: Response): Promise<MoyasarPayment> {
    if (!res.ok) {
      // Sprint A — Task 6.1: surface gateway failures as a typed 502 (bad
      // gateway) so callers can distinguish "Moyasar returned an error"
      // from "our code threw". The raw text is logged elsewhere by the
      // controller — do not echo it back to clients (it can include
      // provider-internal messages).
      throw new AppError(502, 'PAYMENT_GATEWAY_ERROR', 'فشل بوابة الدفع.');
    }
    return (await res.json()) as MoyasarPayment;
  }
}
