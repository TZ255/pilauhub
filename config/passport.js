const LocalStrategy = require('passport-local').Strategy;
const userModel = require('../models/user');

module.exports = function (passport) {
    // Configure local strategy for login
    passport.use(
        new LocalStrategy(
            { usernameField: 'email' }, // tell Passport to look for 'email' instead of 'username'
            async (email, password, done) => {
                try {
                    // Check if user exists
                    const user = await userModel.findOne({ email: email });
                    if (!user) {
                        return done(null, false, { message: `Email hii "${email}" haipo` });
                    }
                    // Check password (PLAIN TEXT FOR DEMO)
                    if (user.password !== password) {
                        return done(null, false, { message: 'Incorrect password' });
                    }
                    // If credentials match, return user
                    return done(null, user);
                } catch (err) {
                    return done(err);
                }
            }
        )
    );

    // Used to serialize the user for the session
    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    // Used to deserialize the user
    passport.deserializeUser(async (id, done) => {
        try {
            //return all data except password
            const user = await userModel.findById(id, {password: 0});
            done(null, user);
        } catch (err) {
            done(err, null);
        }
    });
};