ALTER TABLE `Workflow`
    ADD COLUMN `installedFromTemplateId` VARCHAR(191) NULL;

ALTER TABLE `Credential`
    ADD COLUMN `payloadCiphertext` LONGTEXT NULL;

CREATE TABLE `SystemConfigAudit` (
    `id` VARCHAR(191) NOT NULL,
    `systemConfigId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `changedFields` JSON NOT NULL,
    `beforeSnapshot` JSON NOT NULL,
    `afterSnapshot` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SystemConfigAudit_systemConfigId_createdAt_idx`(`systemConfigId`, `createdAt`),
    INDEX `SystemConfigAudit_actorId_createdAt_idx`(`actorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Workflow`
    ADD CONSTRAINT `Workflow_installedFromTemplateId_fkey`
    FOREIGN KEY (`installedFromTemplateId`) REFERENCES `WorkflowTemplate`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE `SystemConfigAudit`
    ADD CONSTRAINT `SystemConfigAudit_systemConfigId_fkey`
    FOREIGN KEY (`systemConfigId`) REFERENCES `SystemConfig`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE `SystemConfigAudit`
    ADD CONSTRAINT `SystemConfigAudit_actorId_fkey`
    FOREIGN KEY (`actorId`) REFERENCES `User`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
