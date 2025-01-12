const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  videos: {
    type: Array
  },
  payments: {
    type: Array
  },
  resetOTP: {
    type: String,
    default: ''
  },
  otpExpires: {
    type: Date
  }
});

const userModel = mongoose.model('User', UserSchema);
module.exports = userModel