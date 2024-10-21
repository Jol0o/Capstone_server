-- AlterTable
ALTER TABLE `attendance` MODIFY `time_out` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `employees` MODIFY `avatar` VARCHAR(191) NULL,
    MODIFY `day_off` BOOLEAN NULL;

-- AlterTable
ALTER TABLE `payroll` MODIFY `payroll_id` VARCHAR(191) NULL;
