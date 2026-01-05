/*
  Warnings:

  - You are about to drop the `database` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'BASIC', 'ADVANCED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('CREATED', 'ACTIVATED', 'CANCELLED', 'UPGRADED');

-- DropTable
DROP TABLE "database";

-- CreateTable
CREATE TABLE "ActiveSubscription" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "plan" "Plan" NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "popupShown" BOOLEAN NOT NULL DEFAULT false,
    "host" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActiveSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionHistory" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "plan" "Plan" NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreePlanLimits" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "tagAdd" INTEGER NOT NULL DEFAULT 10,
    "tagRemove" INTEGER NOT NULL DEFAULT 10,
    "tagGlobal" INTEGER NOT NULL DEFAULT 5,
    "metaUpdate" INTEGER NOT NULL DEFAULT 10,
    "metaRemove" INTEGER NOT NULL DEFAULT 10,
    "metaGlobal" INTEGER NOT NULL DEFAULT 5,
    "metaRemoveCsvLimit" INTEGER NOT NULL DEFAULT 250,
    "metaUpdateCsvLimit" INTEGER NOT NULL DEFAULT 250,
    "tagAddCsvLimit" INTEGER NOT NULL DEFAULT 250,
    "tagRemoveCsvLimit" INTEGER NOT NULL DEFAULT 250,
    "firstUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreePlanLimits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BasicPlanLimits" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "tagAdd" INTEGER NOT NULL DEFAULT 50,
    "tagRemove" INTEGER NOT NULL DEFAULT 50,
    "tagGlobal" INTEGER NOT NULL DEFAULT 25,
    "metaUpdate" INTEGER NOT NULL DEFAULT 50,
    "metaRemove" INTEGER NOT NULL DEFAULT 50,
    "metaGlobal" INTEGER NOT NULL DEFAULT 25,
    "metaRemoveCsvLimit" INTEGER NOT NULL DEFAULT 1500,
    "metaUpdateCsvLimit" INTEGER NOT NULL DEFAULT 1500,
    "tagAddCsvLimit" INTEGER NOT NULL DEFAULT 1500,
    "tagRemoveCsvLimit" INTEGER NOT NULL DEFAULT 1500,
    "firstUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BasicPlanLimits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActiveSubscription_shopDomain_key" ON "ActiveSubscription"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "FreePlanLimits_shopDomain_key" ON "FreePlanLimits"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "BasicPlanLimits_shopDomain_key" ON "BasicPlanLimits"("shopDomain");
