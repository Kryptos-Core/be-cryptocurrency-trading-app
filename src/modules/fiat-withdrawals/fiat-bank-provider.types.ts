/** Một provider tra cứu ngân hàng / STK (VietQR, BankHub, …). */
export type FiatBankProviderConfig = {
  id: string;
  banksUrl: string;
  lookupUrl: string;
  healthUrl?: string;
  clientId?: string;
  apiKey?: string;
};
