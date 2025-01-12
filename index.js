require('dotenv').config()
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const flash = require('connect-flash');
const passport = require('passport');
const MongoStore = require('connect-mongo');
const path = require('path');
const authRoutes = require('./routes/authRoutes')
const getRoutes = require('./routes/getRoutes')
const resetRoutes = require('./routes/reset')
const postRoutes = require('./routes/postRoutes')

const app = express();

// 1. Database Connection
// database connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to PilauZone DB'))
    .catch((err) => {
        console.log(err)
    })

// 2. Passport Config
require('./config/passport')(passport);

// 3. EJS as our view engine
app.set('view engine', 'ejs');

// 4. Body Parser
app.use(express.urlencoded({ extended: false }));

// 5. Express Session + connect-mongo
app.use(
  session({
    secret: process.env.SESSION_SECRET_KEY,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: 'sessions',
      // ttl (time-to-live) in seconds: 30 minutes = 1800 seconds
      ttl: 60 * 30,
      autoRemove: 'native', // Remove expired sessions automatically
    }),
    cookie: {
      maxAge: 1000 * 60 * 30, // 30 minutes in milliseconds
    },
    rolling: true //the session expiration will reset in every user interaction
  })
);

// 6. Passport Middleware
app.use(passport.initialize());
app.use(passport.session());

// 7. Connect Flash
app.use(flash());

// 8. Global variables for flash messages
app.use((req, res, next) => {
  // success messages
  res.locals.success_msg = req.flash('success_msg');
  // error messages
  res.locals.error_msg = req.flash('error_msg');
  // passport error messages
  res.locals.error = req.flash('error');
  next();
});

// 9. Routes
app.use(authRoutes);
app.use(getRoutes);
app.use(resetRoutes);
app.use(postRoutes);

// 10. Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));