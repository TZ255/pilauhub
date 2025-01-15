const express = require('express');
const router = express()
const isAuth = require('./functions/isAuth');
const userModel = require('../models/user');

router.get('/', isAuth, (req, res)=> {
    res.render('dashboard/dashboard', {user: req.user})
})

router.get('/admin/portal', isAuth, async (req, res)=> {
    try {
        let user = await userModel.findOne({email: req?.user?.email})
        if(!user || user && user.role !== 'admin') {
            return res.send('You are not authorized')
        }
        res.render('admin/admin', {user: req.user})
    } catch (error) {
        
    }
})

module.exports = router