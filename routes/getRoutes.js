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

router.get('/video/:nano', isAuth, async (req, res) => {
    try {
        const nano = req.params.nano
        const userid = req.user._id

        //check if users has enough points
        const user = await userModel.findById(userid)
        if (user?.points < 250) {
            return res.render('points-pages/nopoint', { user: req.user })
        }
        const video = await videoModel.findOne({ nano })
        res.render('video/video', { user: req.user, video })
    } catch (error) {
        res.send('Oops! Samahani, kumetokea tatizo la kimtandao. Jaribu tena')
        console.error(error)
    }
})

router.get('/user/add-points', isAuth, async (req, res) => {
    try {
        let query = req.query
        if (!query) {
            return res.render('points-pages/add/tz', { user: req.user })
        }
        let { cc } = query
        switch (cc) {
            case 'tz':
                return res.render('points-pages/add/tz', { user: req.user })
            case 'ke':
                return res.render('points-pages/add/ke', { user: req.user })
            case 'ug':
                return res.render('points-pages/add/ug', { user: req.user })
        }
    } catch (error) {
        res.send('Oops! Samahani, kumetokea tatizo la kimtandao. Jaribu tena')
        console.error(error)
    }
})



module.exports = router