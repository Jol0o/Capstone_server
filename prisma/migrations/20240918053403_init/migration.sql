-- CreateTable
CREATE TABLE `Admin` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Admin_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attendance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` VARCHAR(191) NOT NULL,
    `time_in` VARCHAR(191) NOT NULL,
    `time_out` VARCHAR(191) NOT NULL,
    `attendance_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `hours` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Employee` (
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

    UNIQUE INDEX `Employee_employee_id_key`(`employee_id`),
    UNIQUE INDEX `Employee_email_key`(`email`),
    UNIQUE INDEX `Employee_phone_number_key`(`phone_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeaveRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` VARCHAR(191) NULL,
    `leave_type` VARCHAR(191) NOT NULL,
    `start_date` DATETIME(3) NOT NULL,
    `end_date` DATETIME(3) NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('Pending', 'Process', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payroll` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `payroll_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `hours_worked` DOUBLE NOT NULL,
    `total_pay` DOUBLE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SmsNotification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `notification_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `phone_number` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `sent_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NULL,

    UNIQUE INDEX `User_user_id_key`(`user_id`),
    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payroll` ADD CONSTRAINT `Payroll_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SmsNotification` ADD CONSTRAINT `SmsNotification_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SmsNotification` ADD CONSTRAINT `SmsNotification_phone_number_fkey` FOREIGN KEY (`phone_number`) REFERENCES `Employee`(`phone_number`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `Employee`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;
