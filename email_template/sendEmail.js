const nodemailer = require('nodemailer');
const ejs = require('ejs');
const path = require('path');

async function sendEmail(email, qrcode) {
    // Create a transporter
    const transporter = nodemailer.createTransport({
        host: "smtp.gmail.email",
        service: 'gmail',
        port: 587,
        secure: false, // Use `true` for port 465, `false` for all other ports
        auth: {
            user: "jloyd9836@gmail.com",
            pass: "fdxf pwdp nuoe bcxm",
        },
    });

    // Render the EJS template
    const html = await ejs.renderFile(path.join(__dirname, './employee_template.ejs'), { email, qrcode });

    // Setup email data
    let mailOptions = {
        from: 'jloyd9836@gmail.comm',
        to: email,
        subject: 'Welcome to Our Website',
        html: html
    };

    // Send the email
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            return console.log(error);
        }
        console.log('Message sent: %s', info.messageId);
    });
}

// sendEmail('jloyd9836@gmail.com', 'https://firebasestorage.googleapis.com/v0/b/capstone-28b31.appspot.com/o/qrCode%2FJohnLoyd%20Belen.png?alt=media&token=d8751768-aa68-465b-a89f-df701b5ce59c');

module.exports = sendEmail;
