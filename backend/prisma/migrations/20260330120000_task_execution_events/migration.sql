-- CreateTable
CREATE TABLE `TaskExecutionEvent` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `type` ENUM('log', 'screenshot', 'status', 'extract') NOT NULL,
    `sequence` INTEGER NOT NULL,
    `level` VARCHAR(191) NULL,
    `nodeId` VARCHAR(191) NULL,
    `message` TEXT NULL,
    `status` ENUM('pending', 'running', 'success', 'failed', 'cancelled') NULL,
    `mimeType` VARCHAR(191) NULL,
    `imageBase64` LONGTEXT NULL,
    `payload` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TaskExecutionEvent_taskId_createdAt_idx`(`taskId`, `createdAt`),
    INDEX `TaskExecutionEvent_taskId_sequence_idx`(`taskId`, `sequence`),
    INDEX `TaskExecutionEvent_taskId_type_idx`(`taskId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TaskExecutionEvent` ADD CONSTRAINT `TaskExecutionEvent_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
