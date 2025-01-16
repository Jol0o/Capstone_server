/*
  Warnings:

  - Added the required column `with_or_without_pay` to the `leaveRequest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `leaverequest` ADD COLUMN `approved_by` VARCHAR(191) NULL,
    ADD COLUMN `date_of_approve` DATETIME(3) NULL,
    ADD COLUMN `date_of_received` DATETIME(3) NULL,
    ADD COLUMN `department_head` VARCHAR(191) NULL,
    ADD COLUMN `hr_department` VARCHAR(191) NULL,
    ADD COLUMN `received_by` VARCHAR(191) NULL,
    ADD COLUMN `recorded_by` VARCHAR(191) NULL,
    ADD COLUMN `with_or_without_pay` VARCHAR(191) NOT NULL,
    MODIFY `supporting_document` VARCHAR(191) NULL;
