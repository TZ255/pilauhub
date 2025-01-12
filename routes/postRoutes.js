const express = require('express')
const router = express()

router.post('/videos', (req, res) => {
    res.render('dashboard/dashboard', { user: req.user });
});

module.exports = router