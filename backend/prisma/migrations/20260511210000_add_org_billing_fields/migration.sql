-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "razorpayCustomerId" TEXT,
ADD COLUMN     "razorpaySubscriptionId" TEXT,
ADD COLUMN     "subscriptionStatus" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_razorpayCustomerId_key" ON "Organization"("razorpayCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_razorpaySubscriptionId_key" ON "Organization"("razorpaySubscriptionId");
