-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" DATETIME
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "meta" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Department" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "shopifyUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "login" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'agent',
    "status" TEXT NOT NULL DEFAULT 'offline',
    "lastSeenAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AgentDepartment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "agentId" INTEGER NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "handle" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "externalId" TEXT NOT NULL DEFAULT '',
    "contactId" INTEGER,
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactHandle" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "preview" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "assigneeId" INTEGER,
    "departmentId" INTEGER,
    "aiStatus" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastMessageAt" DATETIME
);

-- CreateTable
CREATE TABLE "Message" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "externalId" TEXT NOT NULL DEFAULT '',
    "senderType" TEXT NOT NULL,
    "senderId" INTEGER,
    "senderName" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "meta" TEXT NOT NULL DEFAULT '{}',
    "channel" TEXT NOT NULL DEFAULT '',
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "KbDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "sourceKey" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "KbChunk" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "documentId" INTEGER NOT NULL,
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT NOT NULL,
    "embedding" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "mime" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Department_shop_idx" ON "Department"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Department_shop_slug_key" ON "Department"("shop", "slug");

-- CreateIndex
CREATE INDEX "Agent_shop_idx" ON "Agent"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_shop_shopifyUserId_key" ON "Agent"("shop", "shopifyUserId");

-- CreateIndex
CREATE INDEX "AgentDepartment_shop_idx" ON "AgentDepartment"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "AgentDepartment_agentId_departmentId_key" ON "AgentDepartment"("agentId", "departmentId");

-- CreateIndex
CREATE INDEX "Contact_shop_email_idx" ON "Contact"("shop", "email");

-- CreateIndex
CREATE INDEX "Contact_shop_phone_idx" ON "Contact"("shop", "phone");

-- CreateIndex
CREATE INDEX "Contact_shop_handle_idx" ON "Contact"("shop", "handle");

-- CreateIndex
CREATE INDEX "Conversation_shop_channel_idx" ON "Conversation"("shop", "channel");

-- CreateIndex
CREATE INDEX "Conversation_shop_contactId_idx" ON "Conversation"("shop", "contactId");

-- CreateIndex
CREATE INDEX "Conversation_shop_status_idx" ON "Conversation"("shop", "status");

-- CreateIndex
CREATE INDEX "Message_shop_conversationId_idx" ON "Message"("shop", "conversationId");

-- CreateIndex
CREATE INDEX "Message_shop_externalId_idx" ON "Message"("shop", "externalId");

-- CreateIndex
CREATE INDEX "KbDocument_shop_sourceType_idx" ON "KbDocument"("shop", "sourceType");

-- CreateIndex
CREATE INDEX "KbDocument_shop_sourceKey_idx" ON "KbDocument"("shop", "sourceKey");

-- CreateIndex
CREATE INDEX "KbChunk_shop_documentId_idx" ON "KbChunk"("shop", "documentId");

-- CreateIndex
CREATE INDEX "Upload_shop_idx" ON "Upload"("shop");

