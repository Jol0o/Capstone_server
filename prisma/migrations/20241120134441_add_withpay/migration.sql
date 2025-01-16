/*
  Warnings:

  - You are about to drop the column `with_or_without_pay` on the `leaverequest` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `leaverequest` DROP COLUMN `with_or_without_pay`,
    ADD COLUMN `withpay` BOOLEAN NULL;
