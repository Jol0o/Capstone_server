/*
  Warnings:

  - You are about to drop the column `baseSalary` on the `employees` table. All the data in the column will be lost.
  - Added the required column `period_end` to the `payroll` table without a default value. This is not possible if the table is not empty.
  - Added the required column `period_start` to the `payroll` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `employees` DROP COLUMN `baseSalary`,
    ADD COLUMN `basicSalary` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `payroll` ADD COLUMN `period_end` DATETIME(3) NOT NULL,
    ADD COLUMN `period_start` DATETIME(3) NOT NULL;
