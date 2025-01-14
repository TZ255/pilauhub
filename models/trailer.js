const mongoose = require('mongoose');

const TrailerSchema = new mongoose.Schema(
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

const trailerModel = mongoose.model('Trailer', TrailerSchema);
module.exports = trailerModel