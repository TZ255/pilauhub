const express = require('express');
const router = express.Router();
const otpGenerator = require('otp-generator');
const userModel = require('../models/user');
const nodemailer = require('nodemailer');

//get rest page
router.get('/forgot-password', (req, res) => {
    if (!req.isAuthenticated()) {
        res.render('password-reset/forgot')
    } else {
        res.redirect('/')
    }
})

// POST: /forgot-password
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    try {
        // 1. Find user
        const user = await userModel.findOne({ email });
        if (!user) {
            req.flash('error_msg', 'Email not found');
            return res.redirect('/forgot-password');
        }

        // 2. Generate OTP
        const OTP = otpGenerator.generate(6, {
            upperCaseAlphabets: false,
            specialChars: false,
            digits: true,
            lowerCaseAlphabets: false
        });

        // 3. Save OTP + expiry to user
        user.resetOTP = OTP
        user.otpExpires = Date.now() + 15 * 60 * 1000; //15 minutes
        await user.save();

        // 4. Send Email with OTP
        const transporter = nodemailer.createTransport({
            service: 'Gmail',
            auth: {
                user: process.env.EMAIL,
                pass: process.env.EMAIL_PASSWORD
            }
        });

        const mailOptions = {
            from: process.env.EMAIL,
            to: user.email,
            subject: 'Password Reset OTP',
            html: `<p>Your OTP code to reset password is: <b>${OTP}</b>.</p><p>The code is valid for 15 minutes</p>`
        };

        transporter.sendMail(mailOptions)
            .then((mail) => {
                console.log(mail)
                req.flash('success_msg', 'OTP imetumwa. Angalia Email yako');
                res.redirect('/verify-otp');
            })
            .catch((err) => {
                throw err;
            })
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Something went wrong');
        res.redirect('/forgot-password');
    }
});

//get reset OTP page
router.get('/verify-otp', (req, res) => {
    if (!req.isAuthenticated()) {
        req.flash('success_msg', 'Enter your Email, OTP and new password')
        return res.render('password-reset/reset')
    }
    res.redirect('/')
})

//verifying OTP route
router.post('/verify-otp', async (req, res) => {
    const { email, newPassword, otp } = req.body;

    try {
        // 1. Find user by email
        const user = await userModel.findOne({ email });
        if (!user) {
            req.flash('error_msg', `Email hii "${email}" haipo. Ingiza Email sahihi`);
            return res.redirect('/verify-otp');
        }

        // 2. Check if OTP is valid
        if (user.resetOTP !== otp) {
            req.flash('error_msg', 'Umeingiza OTP isiyo sahihi. Ingiza OTP sahihi');
            return res.redirect('/verify-otp');
        }

        // 3. Check if OTP is expired
        if (Date.now() > user.otpExpires) {
            req.flash('error_msg', 'OTP has expired. Request new OTP');
            return res.redirect('/forgot-password');
        }

        // 4. OTP is valid and not expired, change password
        user.password = newPassword
        // 3. Clear the OTP fields
        user.resetOTP = '';
        user.otpExpires = null;
        await user.save()
        req.flash('success_msg', 'Password imebadilishwa kikamilifu. Login kuendelea')
        return res.redirect('/login');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Something went wrong');
        return res.redirect('/verify-otp');
    }
});

module.exports = router;