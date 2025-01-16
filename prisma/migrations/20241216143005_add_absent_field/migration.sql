-- AlterTable
ALTER TABLE `payroll` ADD COLUMN `absent` INTEGER NOT NULL DEFAULT 0,
    MODIFY `period_end` DATETIME(3) NULL,
    MODIFY `period_start` DATETIME(3) NULL;
