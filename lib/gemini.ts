import { GoogleGenAI, Type } from "@google/genai";
import { env } from "./env";

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

export type GeminiExtract = {
  store_name: string;
  transaction_date: string; // YYYY-MM-DD
  currency_code?: string;
  original_total_amount?: number | null;
  original_tax_amount?: number | null;
  total_amount: number;
  tax_amount: number;
  invoice_category: "適格" | "区分記載";
  suggested_debit_account: string;
  description: string;
  memo: string;
  items_summary: string;
};

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    store_name: { type: Type.STRING },
    transaction_date: { type: Type.STRING },
    currency_code: { type: Type.STRING },
    original_total_amount: { type: Type.NUMBER },
    original_tax_amount: { type: Type.NUMBER },
    total_amount: { type: Type.INTEGER },
    tax_amount: { type: Type.INTEGER },
    invoice_category: { type: Type.STRING, enum: ["適格", "区分記載"] },
    suggested_debit_account: { type: Type.STRING },
    description: { type: Type.STRING },
    memo: { type: Type.STRING },
    items_summary: { type: Type.STRING },
  },
  propertyOrdering: [
    "store_name",
    "transaction_date",
    "currency_code",
    "original_total_amount",
    "original_tax_amount",
    "total_amount",
    "tax_amount",
    "invoice_category",
    "suggested_debit_account",
    "description",
    "memo",
    "items_summary",
  ],
};

export async function analyzeReceipt(buffer: Buffer, mimeType: string): Promise<GeminiExtract> {
  const prompt = `
あなたは日本の会計基準に精通した優秀な経理担当者です。
添付された領収書（画像またはPDF）を解析し、指定スキーマに厳密準拠したJSONのみを返してください。

ルール:
- transaction_date は YYYY-MM-DD。複数日付がある場合は 発行日 > 利用日 > 注文日。
- currency_code は領収書に記載された通貨を ISO 4217 の3文字コードで返す（日本円は JPY、米ドルは USD）。不明なら JPY。
- original_total_amount は領収書に記載された通貨の税込合計。読めない場合は推定しない。
- original_tax_amount は領収書に記載された通貨の税額。記載がなければ 0。
- total_amount は JPY の場合のみ税込合計（円、整数）。外貨の場合は original_total_amount を整数化せず、最も近い整数でよい。円換算はサーバ側で行う。
- tax_amount は JPY の場合のみ消費税額（円、整数）。外貨の場合は 0。
- invoice_category は 適格請求書発行事業者登録番号があれば "適格"、なければ "区分記載"。
- suggested_debit_account は品目から推定（迷う場合は "雑費"）。
- items_summary は社内ルール判定に使うので「店名＋主要品目」を短く。

出力はJSONのみ。
  `.trim();

  const base64 = buffer.toString("base64");

  const res = await ai.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema,
    },
  });

  const text = res.text ?? "";
  if (!text.trim()) {
    throw new Error("Gemini returned empty response text");
  }

  try {
    return JSON.parse(text) as GeminiExtract;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to parse Gemini JSON: ${msg}`);
  }
}
