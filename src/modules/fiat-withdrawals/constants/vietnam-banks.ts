/** Mã ngân hàng VN phổ biến — dùng cho dropdown FE/BE validation (MVP). */
export const VIETNAM_BANKS: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'VCB', name: 'Ngân hàng TMCP Ngoại thương Việt Nam (Vietcombank)' },
  { code: 'TCB', name: 'Ngân hàng TMCP Kỹ thương Việt Nam (Techcombank)' },
  { code: 'ACB', name: 'Ngân hàng TMCP Á Châu (ACB)' },
  { code: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV)' },
  { code: 'VPB', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank)' },
  { code: 'MBB', name: 'Ngân hàng TMCP Quân đội (MB Bank)' },
  { code: 'STB', name: 'Ngân hàng TMCP Sài Gòn Thương Tín (Sacombank)' },
  { code: 'TPB', name: 'Ngân hàng TMCP Tiên Phong (TPBank)' },
  { code: 'HDB', name: 'Ngân hàng TMCP Phát triển TP.HCM (HDBank)' },
  { code: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam (VIB)' },
  { code: 'MSB', name: 'Ngân hàng TMCP Hàng Hải Việt Nam (MSB)' },
  { code: 'OCB', name: 'Ngân hàng TMCP Phương Đông (OCB)' },
  { code: 'SHB', name: 'Ngân hàng TMCP Sài Gòn – Hà Nội (SHB)' },
  { code: 'EIB', name: 'Ngân hàng TMCP Xuất nhập khẩu Việt Nam (Eximbank)' },
  { code: 'NAB', name: 'Ngân hàng TMCP Nam Á (Nam A Bank)' },
];

export function resolveVietnamBankName(code: string): string | null {
  const c = code.trim().toUpperCase();
  const row = VIETNAM_BANKS.find((b) => b.code === c);
  return row?.name ?? null;
}
