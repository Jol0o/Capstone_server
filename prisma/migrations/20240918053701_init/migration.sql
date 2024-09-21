/*
  Warnings:

  - You are about to drop the `employee` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `attendance` DROP FOREIGN KEY `Attendance_employee_id_fkey`;

-- DropForeignKey
ALTER TABLE `leaverequest` DROP FOREIGN KEY `LeaveRequest_employee_id_fkey`;

-- DropForeignKey
ALTER TABLE `payroll` DROP FOREIGN KEY `Payroll_employee_id_fkey`;

-- DropForeignKey
ALTER TABLE `smsnotification` DROP FOREIGN KEY `SmsNotification_employee_id_fkey`;

-- DropForeignKey
ALTER TABLE `smsnotification` DROP FOREIGN KEY `SmsNotification_phone_number_fkey`;

-- DropForeignKey
ALTER TABLE `user` DROP FOREIGN KEY `User_employee_id_fkey`;

-- DropTable
DROP TABLE `employee`;

-- CreateTable
CREATE TABLE `Employees` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `salary_date` DATETIME(3) NOT NULL,
    `department` VARCHAR(191) NOT NULL,
    `position` VARCHAR(191) NOT NULL,
    `qrcode` VARCHAR(191) NOT NULL,
    `avatar` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone_number` VARCHAR(191) NOT NULL,
    `salary` INTEGER NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `day_off` BOOLEAN NOT NULL,

    UNIQUE INDEX `Employees_employee_id_key`(`employee_id`),
    UNIQUE INDEX `Employees_email_key`(`email`),
    UNIQUE INDEX `Employees_phone_number_key`(`phone_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payroll` ADD CONSTRAINT `Payroll_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SmsNotification` ADD CONSTRAINT `SmsNotification_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SmsNotification` ADD CONSTRAINT `SmsNotification_phone_number_fkey` FOREIGN KEY (`phone_number`) REFERENCES `Employees`(`phone_number`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;
