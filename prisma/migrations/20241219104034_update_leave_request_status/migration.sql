/*
  Warnings:

  - The values [Process] on the enum `leaveRequest_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `leaverequest` MODIFY `status` ENUM('Pending', 'Processing', 'Approved', 'Rejected', 'Done') NOT NULL DEFAULT 'Pending';
