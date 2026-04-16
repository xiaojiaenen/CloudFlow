ALTER TABLE `SystemConfig`
    ADD COLUMN `smtpIgnoreTlsCertificate` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `Credential` (
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `payload` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Credential_ownerId_idx`(`ownerId`),
    INDEX `Credential_type_idx`(`type`),
    UNIQUE INDEX `Credential_ownerId_key_key`(`ownerId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Credential`
    ADD CONSTRAINT `Credential_ownerId_fkey`
    FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE;
