const mongoose = require('mongoose');

const ThumbSchema = new mongoose.Schema(
  {
    nanoid: { type: String, required: true },
    title: { type: String, required: true },
    casts: { type: String, required: true },
    date: {type: String, required: true},
    tags: {type: String},
    backup: {type: Boolean, default: false},
  },
  { strict: false, timestamps: true }
);

const thumbModel = mongoose.model('Thumb', ThumbSchema);
module.exports = thumbModel