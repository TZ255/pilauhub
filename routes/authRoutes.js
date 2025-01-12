const express = require('express');
const router = express()
const passport = require('passport');
const userModel = require('../models/user');
const isAuth = require('./functions/isAuth');

// GET: Registration Page
router.get('/register', (req, res) => {
    if(req.isAuthenticated()) {
        return res.redirect('/')
    }
    return res.render('register/register');
});

// POST: Handle Registration
router.post('/register', async (req, res) => {
    const { email, password } = req.body;
    let errors = [];

    if (!email || !password) {
        errors.push({ msg: 'Please fill in all fields' });
    }

    if (errors.length > 0) {
        // If there are errors, show them in flash and redirect
        req.flash('error_msg', errors.map((err) => err.msg).join(', '));
        return res.redirect('/register');
    }

    try {
        // Check if user already exists
        const existingUser = await userModel.findOne({ email });
        if (existingUser) {
            req.flash('error_msg', 'Email already in use');
            return res.redirect('/register');
        }

        // Create a new user (PLAIN TEXT PASSWORD FOR DEMO ONLY!)
        const newUser = new userModel({ email, password, username: '123' })
        await newUser.save();

        req.flash('success_msg', 'You are now registered! Please log in.');
        res.redirect('/login');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Something went wrong');
        res.redirect('/register');
    }
});

// GET: Login Page
router.get('/login', (req, res) => {
    if(req.isAuthenticated()) {
        return res.redirect('/')
    }
    return res.render('login/login');
});

// POST: Handle Login
router.post('/login', (req, res, next) => {
    passport.authenticate('local', {
        successRedirect: '/videos',
        failureRedirect: '/login',
        failureFlash: true, // This allows flash messages on failure
    })(req, res, next);
});

// GET: Logout
router.get('/logout', (req, res) => {
    req.logout(() => {
        // In newer versions of Passport, logout can take a callback
        req.flash('success_msg', 'You are logged out');
        res.redirect('/login');
    });
});

module.exports = router;