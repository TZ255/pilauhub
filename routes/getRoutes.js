const express = require('express');
const router = express()
const isAuth = require('./functions/isAuth');

router.get('/', isAuth, (req, res)=> {
    res.render('dashboard/dashboard', {user: req.user})
})

module.exports = router