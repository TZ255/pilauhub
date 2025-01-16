const mongoose = require('mongoose')
const Schema = mongoose.Schema

const gifSchema = new Schema({
    nano: {
        type: String,
        unique: true
    },
    gifId: {
        type: String
    }
}, { timestamps: true, strict: false})

const ohmyNew = mongoose.connection.useDb('ohmyNew')
const tgTrailerModel = ohmyNew.model('gifsModel', gifSchema)
module.exports = tgTrailerModel