-- AlterTable
ALTER TABLE `Workflow`
    ADD COLUMN `alertEmail` VARCHAR(191) NULL,
    ADD COLUMN `alertOnSuccess` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `alertOnFailure` BOOLEAN NOT NULL DEFAULT true;
