-- CreateIndex
CREATE INDEX "customer_history_customerId_visitedAt_idx" ON "customer_history"("customerId", "visitedAt");
