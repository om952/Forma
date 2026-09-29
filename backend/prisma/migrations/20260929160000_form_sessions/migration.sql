-- CreateTable
CREATE TABLE "FormSession" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fieldsTouched" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastFieldId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "responseId" TEXT,

    CONSTRAINT "FormSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FormSession_responseId_key" ON "FormSession"("responseId");

-- CreateIndex
CREATE INDEX "FormSession_formId_viewedAt_idx" ON "FormSession"("formId", "viewedAt");

-- CreateIndex
CREATE INDEX "FormSession_orgId_idx" ON "FormSession"("orgId");

-- CreateIndex
CREATE INDEX "Response_formId_submittedAt_idx" ON "Response"("formId", "submittedAt");

-- AddForeignKey
ALTER TABLE "FormSession" ADD CONSTRAINT "FormSession_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSession" ADD CONSTRAINT "FormSession_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSession" ADD CONSTRAINT "FormSession_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE SET NULL ON UPDATE CASCADE;

