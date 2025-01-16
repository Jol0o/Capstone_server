-- AlterTable
ALTER TABLE `admin` ADD COLUMN `name` VARCHAR(191) NOT NULL DEFAULT 'Unknown',
    ADD COLUMN `position` VARCHAR(191) NULL;
