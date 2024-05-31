# HR Hiring Management Server

This is the server for the HR Hiring Management project. It's built with Express.js, MySQL, and other technologies.

## Installation

Before you start, make sure you have Node.js, npm, and MySQL installed on your machine.

1. Clone this repository:
    ```
    git clone https://github.com/yourusername/capstone_server.git
    ```
2. Navigate into the project directory:
    ```
    cd capstone_serve
    ```
3. Install the dependencies:
    ```
    npm install
    ```

## Database Setup

To set up the MySQL database, follow these steps:

1.  Open XAMPP:
    ```
    start the Apache and MySQL then go to MySQL admin.
    ```
2. Run the following commands to create the database and tables:
    ```sql
    CREATE DATABASE capstone;

    USE capstone;

CREATE TABLE employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(25) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  salary_date DATE NOT NULL,
  department VARCHAR(50) NOT NULL,
  position VARCHAR(50) NOT NULL,
  qrcode VARCHAR(255) NOT NULL,
  avatar VARCHAR(255) NOT NULL,
  email VARCHAR(50) NOT NULL,
  phone_number VARCHAR(11) NOT NULL,
  salary int(255) NOT NULL,
  password varchar(50) NOT NULL,
  day_off tinyint(1) NOT NULL
);

CREATE TABLE attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date VARCHAR(20) NOT NULL,
  time_in VARCHAR(20) NOT NULL,
  time_out VARCHAR(20) NOT NULL,
  attendance_id VARCHAR(50) NOT NULL,
  employee_id VARCHAR(255) NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
);

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL
);

CREATE TABLE admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL
);

CREATE TABLE sms_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  notification_id VARCHAR(50) NOT NULL,
  employee_id VARCHAR(255) NOT NULL,
  phone_number VARCHAR(11) NOT NULL,
  message TEXT NOT NULL,
  sent_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
  FOREIGN KEY (phone_number) REFERENCES employees(phone_number)
);

CREATE TABLE payroll (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payroll_id VARCHAR(50) NOT NULL,
  employee_id VARCHAR(255) NOT NULL,  
  hours_worked DECIMAL(5,2) NOT NULL,
  total_pay DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
);
    ```

## Usage

To start the server, run:

The server will start on [http://localhost:8080](http://localhost:8080).

## API Endpoints

The server provides the following API endpoints:

- `/api/auth`: For authentication related operations.
- `/api/`: Protected routes for managing employees, attendance, users, admins, sms notifications, and payroll.

All `/api/positions` and `/api/candidates` routes are protected and require a valid JWT token in the `Authorization` header.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](https://choosealicense.com/licenses/mit/)
