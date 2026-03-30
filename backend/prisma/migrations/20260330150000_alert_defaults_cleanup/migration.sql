-- AlterTable
ALTER TABLE `Workflow`
    MODIFY `alertOnFailure` BOOLEAN NOT NULL DEFAULT false;

-- Cleanup
UPDATE `Workflow`
SET `alertOnFailure` = false,
    `alertOnSuccess` = false
WHERE `alertEmail` IS NULL OR TRIM(`alertEmail`) = '';
