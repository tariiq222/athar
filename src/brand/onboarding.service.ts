import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CONTENT_PROVIDER, SEARCH_PROVIDER } from '../engine/providers/provider.tokens';
import type { ContentProvider, SummaryResult } from '../engine/providers/content-provider.interface';
import type { SearchProvider } from '../engine/providers/search-provider.interface';
import { BRAND_ANALYZE_CONFIG } from './brand.config';
import { errorEnvelope } from '../common/dto-validation';
import { buildQuestions } from './build-questions';
import type { OnboardingInputDto } from './dto/onboarding-input.dto';
import type {
  BrandAnalysisResult,
  ConfirmationQuestion,
  FetchStatus,
} from './types';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_PROVIDER) private readonly content: ContentProvider,
    @Inject(SEARCH_PROVIDER) private readonly search: SearchProvider,
  ) {}

  // FR-2: pure question derivation, delegated to the pure function.
  buildQuestions(analysis: BrandAnalysisResult): ConfirmationQuestion[] {
    return buildQuestions(analysis);
  }

  // FR-1: fetch + summarize -> unconfirmed draft. Never throws on a failed fetch.
  async analyze(input: OnboardingInputDto, tenantId: string): Promise<BrandAnalysisResult> {
    // AC-8 (PDPL): consent is mandatory before any fetch.
    if (!input.consentAccepted) {
      throw new UnprocessableEntityException(
        errorEnvelope('consent_required', 'يجب قبول الموافقة قبل بدء التحليل', ['consentAccepted']),
      );
    }

    const notes: string[] = [];
    const fetchStatus: FetchStatus = { accounts: [] };
    const texts: string[] = [];
    let fetches = 0;
    let websiteOk = false;
    let anyAccountOk = false;

    // 1) website
    if (input.websiteUrl) {
      if (fetches < BRAND_ANALYZE_CONFIG.maxFetches) {
        fetches++;
        const res = await this.search.fetch({ url: input.websiteUrl });
        await this.recordUsage(tenantId, 'search');
        if (res.ok && res.text) {
          texts.push(res.text);
          fetchStatus.website = 'ok';
          websiteOk = true;
        } else {
          fetchStatus.website = 'failed';
          notes.push('تعذّر جلب الموقع، يمكنك إكمال التهيئة يدوياً');
        }
      } else {
        fetchStatus.website = 'skipped';
      }
    } else {
      fetchStatus.website = 'skipped';
    }

    // 2) accounts (within the fetch cap)
    for (const acc of input.accounts) {
      if (!acc.handle) {
        fetchStatus.accounts.push({ platform: acc.platform, status: 'skipped' });
        continue;
      }
      if (fetches >= BRAND_ANALYZE_CONFIG.maxFetches) {
        fetchStatus.accounts.push({ platform: acc.platform, status: 'skipped' });
        if (!notes.some((n) => n.includes('سقف'))) {
          notes.push('تم بلوغ سقف عمليات الجلب (cap)، عُرضت مسوّدة جزئية');
        }
        continue;
      }
      fetches++;
      const res = await this.search.fetch({ url: acc.handle });
      await this.recordUsage(tenantId, 'search');
      if (res.ok && res.text) {
        texts.push(res.text);
        fetchStatus.accounts.push({ platform: acc.platform, status: 'ok' });
        anyAccountOk = true;
      } else {
        fetchStatus.accounts.push({ platform: acc.platform, status: 'failed' });
      }
    }

    // 3) summarize (one call). Limited retries; on total failure -> minimal draft.
    let summary: SummaryResult | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= BRAND_ANALYZE_CONFIG.maxSummarizeRetries; attempt++) {
      try {
        summary = await this.content.summarize({ texts, goal: 'brand-analysis' });
        await this.recordUsage(tenantId, 'text');
        break;
      } catch (e) {
        lastError = e;
      }
    }
    if (!summary) {
      notes.push('تعذّر التلخيص، عُرضت مسوّدة بحد أدنى');
      summary = this.emptySummary();
    }
    void lastError;

    const source = this.deriveSource(websiteOk, anyAccountOk);
    return {
      source,
      fetchStatus,
      tone: summary.tone,
      products: summary.products,
      audience: summary.audience,
      keywords: summary.keywords,
      suggestedTopics: summary.suggestedTopics,
      suggestedCompetitors: summary.suggestedCompetitors,
      confidence: source === 'manual' ? Math.min(summary.confidence, 0.3) : summary.confidence,
      notes,
    };
  }

  private deriveSource(
    websiteOk: boolean,
    anyAccountOk: boolean,
  ): BrandAnalysisResult['source'] {
    if (websiteOk && anyAccountOk) return 'mixed';
    if (websiteOk) return 'website';
    if (anyAccountOk) return 'accounts';
    return 'manual';
  }

  private emptySummary(): SummaryResult {
    return {
      tone: '',
      products: [],
      audience: '',
      keywords: [],
      suggestedTopics: [],
      suggestedCompetitors: [],
      colors: [],
      visualStyle: '',
      confidence: 0.2,
    };
  }

  private async recordUsage(tenantId: string, kind: 'search' | 'text'): Promise<void> {
    await this.prisma.usageRecord.create({
      data: { tenantId, kind, units: 1 },
    });
  }
}