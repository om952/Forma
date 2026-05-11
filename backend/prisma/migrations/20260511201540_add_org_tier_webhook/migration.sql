-- CreateEnum
CREATE TYPE "OrgTier" AS ENUM ('FREE', 'PREMIUM');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "tier" "OrgTier" NOT NULL DEFAULT 'FREE';
