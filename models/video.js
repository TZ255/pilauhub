const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema(
  {
    nano: { type: String, required: true },
    title: { type: String, required: true },
    casts: { type: String, required: true },
    file_size: { type: Number },
    date: {type: String, required: true},
    tags: {type: String},
    downloads: {type: Number},
    thumb: {type: String},
    trailer: {type: String},
    backup: {type: Boolean, default: false},
  },
  { strict: false, timestamps: true }
);

const videoModel = mongoose.model('Video', videoSchema);
module.exports = videoModel