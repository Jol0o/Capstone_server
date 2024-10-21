/*
  Warnings:

  - You are about to drop the column `salary` on the `employees` table. All the data in the column will be lost.
  - You are about to drop the column `salary_date` on the `employees` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `employees` DROP COLUMN `salary`,
    DROP COLUMN `salary_date`,
    ADD COLUMN `baseSalary` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `hierarchy` VARCHAR(191) NOT NULL DEFAULT 'employee',
    ADD COLUMN `totalSalary` INTEGER NOT NULL DEFAULT 0;
