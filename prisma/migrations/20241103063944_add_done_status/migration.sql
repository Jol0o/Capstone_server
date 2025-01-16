-- AlterTable
ALTER TABLE `leaverequest` MODIFY `status` ENUM('Pending', 'Process', 'Approved', 'Rejected', 'Done') NOT NULL DEFAULT 'Pending';
