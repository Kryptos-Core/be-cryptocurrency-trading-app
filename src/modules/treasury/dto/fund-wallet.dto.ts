import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class FundWalletDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,18})?$/, {
    message: 'amount must be a valid decimal string up to 18 decimal places',
  })
  amount!: string;
}
