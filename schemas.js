//jshint esversion:6
const mongoose = require("mongoose");
const ObjectId = require("mongodb").ObjectID;

const contentSchema = new mongoose.Schema({
  creatorId: ObjectId,
  creatorUsername: String,
  title: String,
  content:String,
  hasImage: Boolean,
  timestamp: Number, // May cause errors in the future when timestamp exceeds number limits.
  roomId: ObjectId
});

const roomSchema = new mongoose.Schema({
  creatorId: ObjectId,
  name: String,
  description: String,
  listOfStudents: [ObjectId],
  type: String,
  accessRequests: [ObjectId],
  imageUrl: String
});

const userSchema = new mongoose.Schema({
  username: String,
  googleId: String,
  outlookId: String,
  facebookId: String,
  name: String,
  country: String,
  phoneNumber: String,
  course: String,
  imageUrl: String
});

module.exports.userSchema = userSchema;
module.exports.contentSchema= contentSchema;
module.exports.roomSchema = roomSchema;
