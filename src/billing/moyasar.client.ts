import { Injectable } from '@nestjs/common';
import { MoyasarPayment, CreatePaymentInput } from './billing.types';

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
    const text = await res.text();
    if (!res.ok) throw new Error(`Moyasar ${res.status}: ${text}`);
    return JSON.parse(text) as MoyasarPayment;
  }
}
