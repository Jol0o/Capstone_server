require('dotenv').config(); // Load environment variables from .env file
const nodemailer = require('nodemailer');
const ejs = require('ejs');
const path = require('path');

async function sendEmail(email, qrcode, message, type = 'welcome') {
    // Create a transporter
    const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com", // Corrected SMTP host
        port: 465, // Use port 465 for secure connection
        secure: true, // Use `true` for port 465
        auth: {
            user: process.env.EMAIL,
            pass: process.env.APP_PASSWORD, // Use app password if 2FA is enabled
        }, tls: {
            // Do not fail on invalid certs
            rejectUnauthorized: false
        }
    });

    // Render the EJS template
    const templatePath = type === 'welcome' ? './employee_template.ejs' : './employee_payslip.ejs';
    const html = await ejs.renderFile(path.join(__dirname, templatePath), { email, qrcode, message });

    // Setup email data
    let mailOptions = {
        from: process.env.EMAIL,
        to: email,
        subject: 'Welcome to Our Website',
        html: html
    };

    // Send the email
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email:', error);
            return;
        }
        console.log('Message sent: %s', info.messageId);
    });
}

// Uncomment the following line to test the function
// sendEmail('jloyd9836@gmail.com', 'https://firebasestorage.googleapis.com/v0/b/capstone-28b31.appspot.com/o/qrCode%2FJohnLoyd%20Belen.png?alt=media&token=d8751768-aa68-465b-a89f-df701b5ce59c');

module.exports = sendEmail;