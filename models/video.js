const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema(
  {
    nanoid: { type: String, required: true },
    title: { type: String, required: true },
    casts: { type: String, required: true },
    date: {type: String, required: true},
    tags: {type: String},
    downloads: {type: String},
    backup: {type: Boolean, default: false},
  },
  { strict: false, timestamps: true }
);

const videoModel = mongoose.model('Video', videoSchema);
module.exports = videoModel