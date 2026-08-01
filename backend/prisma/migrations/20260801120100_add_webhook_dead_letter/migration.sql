-- CreateTable
CREATE TABLE "WebhookDeadLetter" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "webhookId" TEXT,
    "url" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "lastError" TEXT NOT NULL,
    "attemptsMade" INTEGER NOT NULL,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDeadLetter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookDeadLetter_orgId_idx" ON "WebhookDeadLetter"("orgId");

-- CreateIndex
CREATE INDEX "WebhookDeadLetter_formId_idx" ON "WebhookDeadLetter"("formId");

-- CreateIndex
CREATE INDEX "WebhookDeadLetter_webhookId_idx" ON "WebhookDeadLetter"("webhookId");

-- AddForeignKey
ALTER TABLE "WebhookDeadLetter" ADD CONSTRAINT "WebhookDeadLetter_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDeadLetter" ADD CONSTRAINT "WebhookDeadLetter_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDeadLetter" ADD CONSTRAINT "WebhookDeadLetter_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE SET NULL ON UPDATE CASCADE;
