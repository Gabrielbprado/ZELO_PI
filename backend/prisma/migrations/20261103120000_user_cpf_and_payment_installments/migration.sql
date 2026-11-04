-- AlterTable: User (CPF para pagamentos e KYC)
ALTER TABLE "User" ADD COLUMN "cpf" TEXT;
CREATE UNIQUE INDEX "User_cpf_key" ON "User"("cpf");

-- AlterTable: Payment (parcelamento)
ALTER TABLE "Payment" ADD COLUMN "installments" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "installmentAmount" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "totalAmount" INTEGER;
