import type { GeminiExtract } from "./gemini";

const JPY_RATES: Record<string, number> = {
  USD: 155,
  EUR: 165,
  GBP: 190,
};

export type NormalizedReceiptAmounts = {
  totalAmountJpy: number;
  taxAmountJpy: number;
  normalizedExtracted: GeminiExtract & {
    currency_code: string;
    original_total_amount: number | null;
    original_tax_amount: number | null;
    exchange_rate_to_jpy: number;
  };
};

function normalizeCurrencyCode(value: string | null | undefined): string {
  const code = (value ?? "JPY").trim().toUpperCase();
  if (!code || code === "¥" || code === "￥") return "JPY";
  if (code === "$" || code === "US$") return "USD";
  if (code === "€" || code === "EURO") return "EUR";
  if (code === "£") return "GBP";
  return code;
}

function toNonNegativeAmount(value: number | null | undefined, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return value;
}

function roundJpy(value: number, fieldName: string): number {
  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded) || rounded < 0) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return rounded;
}

export function normalizeReceiptAmountsToJpy(extracted: GeminiExtract): NormalizedReceiptAmounts {
  const currencyCode = normalizeCurrencyCode(extracted.currency_code);
  const originalTotalAmount = toNonNegativeAmount(
    extracted.original_total_amount ?? extracted.total_amount,
    "original_total_amount"
  );
  const originalTaxAmount = toNonNegativeAmount(
    extracted.original_tax_amount ?? extracted.tax_amount ?? 0,
    "original_tax_amount"
  );

  if (currencyCode === "JPY") {
    const totalAmountJpy = roundJpy(originalTotalAmount, "total_amount");
    const taxAmountJpy = roundJpy(originalTaxAmount, "tax_amount");
    return {
      totalAmountJpy,
      taxAmountJpy,
      normalizedExtracted: {
        ...extracted,
        currency_code: currencyCode,
        original_total_amount: originalTotalAmount,
        original_tax_amount: originalTaxAmount,
        exchange_rate_to_jpy: 1,
        total_amount: totalAmountJpy,
        tax_amount: taxAmountJpy,
      },
    };
  }

  const exchangeRateToJpy = JPY_RATES[currencyCode];
  if (!exchangeRateToJpy) {
    throw new Error(`Unsupported currency: ${currencyCode}`);
  }

  const totalAmountJpy = roundJpy(originalTotalAmount * exchangeRateToJpy, "total_amount");

  return {
    totalAmountJpy,
    taxAmountJpy: 0,
    normalizedExtracted: {
      ...extracted,
      currency_code: currencyCode,
      original_total_amount: originalTotalAmount,
      original_tax_amount: originalTaxAmount,
      exchange_rate_to_jpy: exchangeRateToJpy,
      total_amount: totalAmountJpy,
      tax_amount: 0,
    },
  };
}
