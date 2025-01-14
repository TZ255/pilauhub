const express = require('express');
const router = express()
const passport = require('passport');
const userModel = require('../models/user');
const isAuth = require('./functions/isAuth');

// GET: Registration Page
router.get('/register', (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/')
    }
    return res.render('register/register');
});

//request registering
router.get('/request-register', (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/')
    }
    return res.render('register/request');
});

// POST: Handle Registration
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    let errors = [];

    if (!email || !password || !username) {
        errors.push({ msg: 'Tafadhali jaza taarifa zako zote' });
    }

    if (errors.length > 0) {
        // If there are errors, show them in flash and redirect
        req.flash('error_msg', errors.map((err) => err.msg).join(', '));
        return res.redirect('/register');
    }

    try {
        // Check if user already exists and registered
        const existingUser = await userModel.findOne({ username });
        if (existingUser) {
            //check if registerd
            if (existingUser?.status == "registered") {
                req.flash('error_msg', 'Username yako tayari imesajiliwa. Tafadhali login');
                return res.redirect('/login');
            }
            if (existingUser?.status == "pending") {
                // Update user with email and new password (PLAIN TEXT PASSWORD FOR DEMO ONLY!)
                existingUser.email = email
                existingUser.password = password
                existingUser.status = 'registered'
                await existingUser.save()

                req.flash('success_msg', 'Umejisajili kikamilifu. Ingiza email na password yako kulogin');
                return res.redirect('/login');
            }
        }
        //if user not allowed
        req.flash('error_msg', 'Umeingiza username isio sahihi au bado hujaruhusiwa kujisajili PilauHub');
        return res.redirect('/register')
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Something went wrong');
        res.redirect('/register');
    }
});

// GET: Login Page
router.get('/login', (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/')
    }
    return res.render('login/login');
});

// POST: Handle Login
router.post('/login', (req, res, next) => {
    passport.authenticate('local', {
        successRedirect: '/',
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