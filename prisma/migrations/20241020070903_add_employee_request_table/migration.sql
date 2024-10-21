-- AlterTable
ALTER TABLE `employeerequest` ADD COLUMN `status` ENUM('pending', 'confirmed', 'rejected') NOT NULL DEFAULT 'pending';
