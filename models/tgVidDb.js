const mongoose = require('mongoose')
const Schema = mongoose.Schema

const tgSchema = new Schema({
    uniqueId: {
        type: String
    },
    fileId: {
        type: String
    },
    fileType: {
        type: String,
    },
    caption: {
        type: String
    },
    caption_entities: {
        type: Array
    },
    nano: {
        type: String,
        unique: true
    },
    msgId: {
        type: Number
    }

}, { strict: false, timestamps: true })

const ohMyDB = mongoose.connection.useDb('ohmyNew')
const tgVideoModel = ohMyDB.model('tgDb', tgSchema)
module.exports = tgVideoModel