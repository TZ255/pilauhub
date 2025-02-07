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
const postRoutes = require('./routes/postRoutes');
const isAuth = require('./routes/functions/isAuth');
const http = require('http');
const socketIO = require('socket.io');
const videoDataSocket = require('./routes/sockets/videodata');
const movieDataSocket = require('./routes/sockets/moviedata');

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

//static files
app.use(express.static(__dirname + '/public'))

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
      // ttl (time-to-live) in seconds: 1 week
      ttl: 60 * 60 * 24 * 7,
      autoRemove: 'native', // Remove expired sessions automatically
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week (in miliseconds)
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

//static protected files (thumbs, trailers, screenshots etc...)
app.use('/private', isAuth, express.static(__dirname + '/private'));

// 9. Routes
app.use(authRoutes);
app.use(getRoutes);
app.use(resetRoutes);
app.use(postRoutes);

// 10. Start the server
const server = http.createServer(app)
const io = socketIO(server)

// Handle Socket.IO connections on '/receive/socket' namespace
const receiveSocket = io.of('/receive/videodata');
const receiveMovie = io.of('/receive/moviedata')

receiveSocket.on('connection', (socket) => {
  console.log('New Socket.IO connection established on /receive/videodata');

  //sockets goes here
  videoDataSocket(socket)

  socket.on('disconnect', () => {
    console.log('Socket.IO connection closed');
  });

  socket.on('error', (error) => {
    console.error(`Socket.IO error: ${error}`);
  });
});

//movie
receiveMovie.on('connection', (socket) => {
  console.log('New Socket.IO Movie connection established on /receive/moviedata');

  //sockets goes here
  movieDataSocket(socket)

  socket.on('disconnect', () => {
    console.log('Socket.IO movie connection closed');
  });

  socket.on('error', (error) => {
    console.error(`Socket.IO error: ${error}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '127.0.0.1', () => console.log(`Server running on port ${PORT}`));