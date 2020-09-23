const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const passport = require("passport");
const schemas = require("../schemas");
const contentSchema = schemas.contentSchema;
const ContentCard = new mongoose.model("ContentCard", contentSchema);
const userSchema = schemas.userSchema;
const roomSchema = schemas.roomSchema;
const Room = new mongoose.model("Room", roomSchema);
const authRoutes = require("../routes/auth");
const {
  Storage
} = require('@google-cloud/storage');
const multer = require('multer')
const upload = multer({
  dest: '../uploadedImage'
});

// Room types.
const PUBLIC = "public";
const PRIVATE = "private";

// Room access status.
const ACCESS_GRANTED = "granted";
const ACCESS_DENIED = "denied";
const ACCESS_REQUESTED = "requested";

// Authenticate google cloud storage client and create bucket.
const projectId = 'dkitinterhub'
const keyFilename = './DkitInterHub-18ea7da7837a.json'
const storage = new Storage({
  projectId,
  keyFilename
});
const studentProfileImagesBucket = storage.bucket('studentinterhub_userprofileimages');
const roomImagesBucket = storage.bucket('studentinterhub_roomimages');
const contentImagesBucket = storage.bucket('studentinterhub_contentimages');

// Setup server requests and responses on different routes.
router.get("/", function(req, res) {
  if (req.isAuthenticated()) {
    res.redirect("/dashboard");
  } else {
    res.render("home");
  }
});

router.get("/dashboard", function(req, res) {
  if (req.isAuthenticated()) {
    if (req.user.username == undefined) {
      res.redirect("/userProfileInput");
    } else {
      ContentCard.find({ roomId: undefined }, function(err, foundContents) {
        getContentImageSignedUrls(foundContents)
            .then((contentImageSignedUrls) => {
              const studentProfileImageFileName = req.user._id + ".img";
              const studentProfileImagefile = studentProfileImagesBucket.file(studentProfileImageFileName);
              createOrUpdateUserProfileImage(req, studentProfileImagefile)
                .then(res.render("dashboard", {
                  user: req.user,
                  contents: foundContents,
                  contentImageSignedUrls: contentImageSignedUrls
                }))
                .catch((err) => console.log(err));
            });
      });
    }
  } else {
    res.redirect("/login");
  }
});

async function getContentImageSignedUrls(foundContents) {
  const promises = [];
  const config = {
    action: "read",
    expires: '12-31-9999'
  }
  for (var i = 0;i < foundContents.length;i ++) {
    if (foundContents[i].hasImage) {
      const contentImageFileName = foundContents[i]._id + ".img";
      const contentImageFile = await contentImagesBucket.file(contentImageFileName);
      promises.push(contentImageFile.getSignedUrl(config));
    } else {
      promises.push("");
    }
  }
  const contentImageSignedUrls = await Promise.all(promises);
  return contentImageSignedUrls;
}

router.get("/login", function(req, res) {
  if (req.isAuthenticated()) {
    res.redirect("dashboard");
  } else {
    res.render("login");
  }
});

router.get("/logout", function(req, res) {
  req.logout();
  res.redirect("/");
});

router.post("/createContent", upload.single("contentImage"), function(req, res) {
  const title = req.body.title;
  const content = req.body.content;
  var redirectUrl;
  var roomId;
  if (req.body.roomId == undefined) {
    redirectUrl = "/dashboard";
  } else {
    roomId = mongoose.Types.ObjectId(req.body.roomId);
    redirectUrl = "/room/" + roomId;
  }
  var hasImage = false;
  if (req.file != undefined) {
    hasImage = true;
  }
  ContentCard.create({ creatorId: req.user._id, creatorUsername: req.user.username, title: title, content: content, timestamp: Math.floor(Date.now() / 1000), roomId: roomId, hasImage: hasImage }, function(err, createdContent) {
    if (err) {
      console.log(err);
    } else if (req.file != undefined) {
      const destination = createdContent._id + ".img";
      const options = {
        destination: destination,
        resumable: true,
        validation: 'crc32c'
      };

      contentImagesBucket.upload(req.file.path, options, function(err, file) {
        if (err) {
          console.log(err);
          return;
        }
        res.redirect(redirectUrl);
      });
    } else {
      res.redirect(redirectUrl);
    }
  });
});

router.post("/userProfileImage", upload.single('userProfileImage'), function(req, res) {
  const destination = req.user._id + ".img";
  const options = {
    destination: destination,
    resumable: true,
    validation: 'crc32c'
  };

  studentProfileImagesBucket.upload(req.file.path, options, function(err, file) {
    if (err) {
      console.log(err);
      return;
    }
    res.redirect("/");
  });
});

async function createOrUpdateUserProfileImage(req, file) {
  const config = {
    action: "read",
    expires: '12-31-9999'
  }
  const User = new mongoose.model("User", userSchema);
  await file.getSignedUrl(config, function(err, url) {
    if (err) {
      console.error(err);
      return;
    }
    User.findOneAndUpdate({
      _id: req.user._id
    }, {
      imageUrl: url
    }, function(err, foundUser) {
      if (err) {
        console.log(err);
        return;
      }
    });
  });
}

router.get("/userProfileInput", function(req, res) {
  res.render("userProfileInput");
});

router.post("/usernameAvailabilityChecker", function(req, res) {
  const username = req.body.username;
  const User = new mongoose.model("User", userSchema);
  User.find({
    username: {
      $regex: "^" + username + "$",
      $options: "i"
    }
  }, function(err, foundUser) {
    if (err) {
      console.log(err);
      return;
    } else if (foundUser.length == 0) {
      res.send("Username is available!");
    } else {
      res.send("Username not available!");
    }
  });
});

router.post("/userProfileInput", upload.single("userProfileImage"), function(req, res) {
  const username = req.body.username;
  const country = req.body.country;
  const course = req.body.course;
  var filePath;
  if (req.file == undefined) {
    filePath = "./images/defaultImage.png";
  } else {
    filePath = req.file.path;
  }
  const destination = req.user._id + ".img";
  const options = {
    destination: destination,
    resumable: true,
    validation: 'crc32c'
  };
  studentProfileImagesBucket.upload(filePath, options, function(err, file) {
    if (err) {
      console.log(err);
      return;
    }
    const config = {
      action: "read",
      expires: '12-31-9999'
    }
    const User = new mongoose.model("User", userSchema);
    file.getSignedUrl(config, function(err, url) {
      User.findOneAndUpdate({
        _id: req.user._id
      }, {
        username: username,
        country: country,
        course: course,
        imageUrl: url
      }, function(err, foundUser) {
        if (err) {
          console.log(err);
          return;
        } else {
          res.redirect("/dashboard");
        }
      });
    });
  });
});

router.get("/createRoom", function(req, res) {
  if (req.isAuthenticated()) {
    res.render("createRoom");
  } else {
    res.redirect("/");
  }
});

router.post("/existingUsers", function(req, res) {
  const User = new mongoose.model("User", userSchema);
  const startingLettersRegex = "^" + req.body.inputElement;
  findUserThatHasMatchingUsername(req)
    .then((matchedUser) => {
      User.find({
          $and: [{
            username: {
              $regex: startingLettersRegex,
              $options: "i"
            }
          }, {
            username: {
              $not: {
                $eq: req.user.username
              }
            }
          }, {
            username: {
              $not: {
                $eq: matchedUser.username
              }
            }
          }]
        }, function(err, foundUsers) {
          if (err) {
            console.log(err);
          } else if (matchedUser.foundUser != undefined) {
            foundUsers.unshift(matchedUser.foundUser);
            res.send(foundUsers);
          } else {
            res.send(foundUsers);
          }
        })
        .limit(4);
    });
});

async function findUserThatHasMatchingUsername(req) {
  return new Promise(function(resolve, reject) {
      const User = new mongoose.model("User", userSchema);
      User.findOne({
        $and: [{
          username: req.body.inputElement
        },
        {username: {
          $not: {
            $eq: req.user.username
          }
        }}]
      }, function(err, foundUser) {
        if (err) {
          console.log(err);
        } else if (foundUser) {
          resolve({
            username: foundUser.username,
            foundUser: foundUser
          });
        }
        resolve({
          username: ""
        });
      });
    })
    .then((foundUser) => {
      return foundUser;
    });
}

router.post("/existingRooms", function(req, res) {
  const startingLettersRegex = "^" + req.body.inputElement;
  findRoomsThatHasMatchingName(req)
    .then((matchedRoom) => {
      Room.find({
          $and: [{
            name: {
              $regex: "^" + startingLettersRegex,
              $options: "i"
            }
          }, {
            name: {
              $not: {
                $regex: "^" + matchedRoom.name + "$",
                $options: "i"
              }
            }
          }]
        }, function(err, foundRooms) {
          if (err) {
            console.log(err);
          } else if (matchedRoom.foundRoom != undefined) {
            foundRooms.unshift(matchedRoom.foundRoom);
            res.send(foundRooms);
          } else {
            res.send(foundRooms);
          }
        })
        .limit(4);
    });
});

async function findRoomsThatHasMatchingName(req) {
  return new Promise(function(resolve, reject) {
      Room.findOne({name: {$regex: "^" + req.body.inputElement + "$",$options: "i"}}, function(err, foundRoom) {
        if (err) {
          console.log(err);
        } else if (foundRoom) {
          resolve({
            name: foundRoom.name,
            foundRoom: foundRoom
          });
        }
        resolve({
          name: ""
        });
      });
    })
    .then((foundRoom) => {
      return foundRoom;
    });
}

router.post("/roomnameAvailabilityChecker", function(req, res) {
  const roomname = req.body.roomname;
  Room.find({
    name: {
      $regex: "^" + roomname + "$",
      $options: "i"
    }
  }, function(err, foundRooms) {
    if (err) {
      console.log(err);
      return;
    } else if (foundRooms.length == 0) {
      res.send("Room name is available!");
    } else {
      res.send("Room name not available!");
    }
  });
});

router.post("/createRoom", function(req, res) {
  const name = req.body.name;
  const description = req.body.description;
  const type = req.body.roomType;
  var listOfStudents;
  if (type == PRIVATE) {
    if (req.body.selectedFriends != undefined) {
      listOfStudents = req.body.selectedFriends.map(function(e) {
        return mongoose.Types.ObjectId(e);
      });
      listOfStudents.push(req.user._id);
    } else {
      listOfStudents = [req.user._id];
    }
    const User = new mongoose.model("User", userSchema);
    Room.create({creatorId: req.user._id, name: name, description: description, listOfStudents: listOfStudents, type: type}, function(err, createdRoom) {
      if (err) {
        console.log(err);
        return;
      }
      res.redirect("/room/" + createdRoom._id);
    });
  } else {
    Room.create({creatorId: req.user._id, name: name, description: description, type: type}, function(err, createdRoom) {
      if (err) {
        console.log(err);
        return;
      }
      res.redirect("/room/" + createdRoom._id);
    });
  }
});

router.get("/room", function(req, res) {
  res.redirect("/rooms");
});

router.get("/room/:roomId", function(req, res) {
  const roomId = mongoose.Types.ObjectId(req.params.roomId);
  ContentCard.find({roomId: roomId}, function(err, contents) {
    Room.findById(roomId, function(err, foundRoom) {
      if (err) {
        console.log(err);
        return;
      }
      else if (!foundRoom) {
        res.status(404).send("Room is not found.");
      }
      else if (foundRoom.type == PRIVATE) {
        if (foundRoom.listOfStudents.includes(req.user._id)) {
          if (String(req.user._id) == String(foundRoom.creatorId)) {
            pushUsersIdsToList(foundRoom)
                .then((requesting_users) => {
                  getContentImageSignedUrls(contents)
                      .then((contentImageSignedUrls) => {
                        const studentProfileImageFileName = req.user._id + ".img";
                        const studentProfileImagefile = studentProfileImagesBucket.file(studentProfileImageFileName);
                        createOrUpdateUserProfileImage(req, studentProfileImagefile)
                          .then(res.render("room", {
                            user: req.user,
                            requesting_users: requesting_users,
                            contents: contents,
                            room: foundRoom,
                            contentImageSignedUrls: contentImageSignedUrls,
                            accessStatus: ACCESS_GRANTED
                          }))
                          .catch((err) => console.log(err));
                      });
                });
          } else {
            getContentImageSignedUrls(contents)
                .then((contentImageSignedUrls) => {
                  const studentProfileImageFileName = req.user._id + ".img";
                  const studentProfileImagefile = studentProfileImagesBucket.file(studentProfileImageFileName);
                  createOrUpdateUserProfileImage(req, studentProfileImagefile)
                    .then(res.render("room", {
                      user: req.user,
                      contents: contents,
                      requesting_users: undefined,
                      room: foundRoom,
                      contentImageSignedUrls: contentImageSignedUrls,
                      accessStatus: ACCESS_GRANTED
                    }))
                    .catch((err) => console.log(err));
                });
          }
        }
        else if (foundRoom.accessRequests.includes(req.user._id)) {
          res.render("room", {user: req.user, room: foundRoom, accessStatus: ACCESS_REQUESTED});
        }
        else {
          res.render("room", {user: req.user, room: foundRoom, accessStatus: ACCESS_DENIED});
        }
      }
      else {
        getContentImageSignedUrls(contents)
            .then((contentImageSignedUrls) => {
              const studentProfileImageFileName = req.user._id + ".img";
              const studentProfileImagefile = studentProfileImagesBucket.file(studentProfileImageFileName);
              createOrUpdateUserProfileImage(req, studentProfileImagefile)
                .then(res.render("room", {
                  user: req.user,
                  contents: contents,
                  requesting_users: undefined,
                  room: foundRoom,
                  contentImageSignedUrls: contentImageSignedUrls,
                  accessStatus: ACCESS_GRANTED
                }))
                .catch((err) => console.log(err));
            });
      }
    });
  });
});

async function pushUsersIdsToList(foundRoom) {
  const promises = [];
  const accessRequests = foundRoom.accessRequests;
  for (var i = 0;i < accessRequests.length;i++) {
      const User = new mongoose.model("User", userSchema);
      promises.push(User.findById(accessRequests[i]));
  }
  const requesting_users = await Promise.all(promises);
  return requesting_users;
}

router.post("/requestAccess", function(req, res) {
  const roomId = req.body.roomId;
  Room.findOneAndUpdate({_id: roomId}, {$push: {accessRequests: req.user._id}}, function(err, foundRoom) {
    if (err) {
      console.log(err);
      return;
    }
    res.redirect("/room/" + roomId);
  });
});

// router.post("/acceptInvitation", function(req, res) {
//   const roomId = mongoose.Types.ObjectId(req.body.roomId);
//   const roomName = req.body.roomName;
//   Room.findOneAndUpdate({_id: roomId}, {$push: {listOfStudents: req.user._id}}, function(err, foundRoom) {
//     if (err) {
//       console.log(err);
//       return;
//     } else if (foundRoom) {
//       User.findOneAndUpdate({_id: req.user._id}, {$pull: {invitations: foundRoom}}, function(err, foundUser) {
//         if (err) {
//           console.log(err);
//           return;
//         }
//       });
//     }
//   });
// });
//
// router.post("/denyInvitation", function(req, res) {
//   const roomId = req.body.roomId;
//   Room.findById(roomId, function(err, foundRoom) {
//     if (err) {
//       console.log(err);
//       return;
//     } else if (foundRoom){
//       User.findOneAndUpdate({_id: req.user._id}, {$pull: {invitations: foundRoom}}, function(err, foundUser) {
//         if (err) {
//           console.log(err);
//           return;
//         }
//       });
//     }
//   });
// });

router.post("/acceptRequestAccess", function(req, res) {
  console.log(req.body.requesterId);
  console.log(req.body.roomId);
  const requesterId = mongoose.Types.ObjectId(req.body.requesterId);
  const roomId = mongoose.Types.ObjectId(req.body.roomId);
  // Remove requesterId from Room.accessRequests
  // Add requesterId to listOfStudents
  Room.findOneAndUpdate({_id: roomId}, {$pull: {accessRequests: requesterId}, $push: {listOfStudents: requesterId}}, function(err, foundRoom) {
    if (err) {
      console.log(err);
      return;
    }
    res.redirect("/room/" + roomId);
  });
});

router.post("/denyRequestAccess", function(req, res) {
  const requesterId = mongoose.Types.ObjectId(req.body.requesterId);
  const roomId = mongoose.Types.ObjectId(req.body.roomId);
  // Add requesterId to listOfStudents
  Room.findOneAndUpdate({_id: roomId}, {$pull: {accessRequests: requesterId}}, function(err, foundRoom) {
    if (err) {
      console.log(err);
      return;
    }
    res.redirect("/room/" + roomId);
  });
});

router.use("/auth", authRoutes);

module.exports = router;
