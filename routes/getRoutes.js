const express = require('express');
const router = express()
const isAuth = require('./functions/isAuth');
const userModel = require('../models/user');
const videoModel = require('../models/video');

router.get('/', isAuth, async (req, res) => {
    try {
        const videos = await videoModel.find().sort('-createdAt').limit(10)
        res.render('dashboard/dashboard', { user: req.user, videos })
    } catch (error) {
        res.send('Samahani! Kumetokea changamoto ya kimtandao')
    }
})

router.get('/admin/portal', isAuth, async (req, res) => {
    try {
        let user = await userModel.findOne({ email: req?.user?.email })
        if (!user || user && user.role !== 'admin') {
            return res.send('You are not authorized')
        }
        res.render('admin/admin', { user: req.user })
    } catch (error) {

    }
})

module.exports = router