-- CreateTable
CREATE TABLE "instance_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instance_settings_pkey" PRIMARY KEY ("key")
);
