const fs = require("fs");
const { bucket } = require("../firebase-config");
const { getStorage, getDownloadURL } = require('firebase-admin/storage');
const { validationResult } = require("express-validator");
const mongoose = require("mongoose");
const { v1: uuidv1 } = require('uuid');
const HttpError = require("../models/http-error");
const getCoordsForAddress = require("../util/location");
const Place = require("../models/place");
const User = require("../models/user");

const getPlaceById = async (req, res, next) => {
  const placeId = req.params.pid;

  let place;
  try {
    place = await Place.findById(placeId);
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, could not find a place.",
      500
    );
    return next(error);
  }

  if (!place) {
    const error = new HttpError(
      "Could not find a place for the provided id.",
      404
    );
    return next(error);
  }

  res.json({ place: place.toObject({ getters: true }) });
};

//alternatives
//function getPlaceById(){ ... }
//const getPlaceById = function(){ ... }

const getPlacesByUserId = async (req, res, next) => {
  const userId = req.params.uid;

  let places;
  try {
    places = await Place.find({ creator: userId });
  } catch (err) {
    return next(
      new HttpError("Fetching places failed, please try again later", 500)
    );
  }

  // if (!places || places.length === 0) {
  //   return next(
  //     new HttpError("Could not find places for the provided user id.", 404)
  //   );
  // }

  res.json({
    places: places.map((place) => place.toObject({ getters: true })),
  });
};

const MIME_TYPE_MAP = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpg",
};

const createPlace = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new HttpError("Invalid inputs passed, please check your data.", 422));
  }

  const { title, description, address } = req.body;
  let coordinates;
  try {
    coordinates = await getCoordsForAddress(address);
  } catch (error) {
    return next(error);
  }


  // Upload file to Firebase Storage
  const image = req.file.buffer;
  const imageName = uuidv1() + '.' + MIME_TYPE_MAP[req.file.mimetype];
  const imageRef = bucket.file('places/' + imageName);

  try {
    await imageRef.save(image, {
      metadata: { contentType: req.file.mimetype },
    });

    //const res = await imageRef.makePublic();

      // Generate a signed URL for temporary access
    // const [signedUrl] = await imageRef.getSignedUrl({
    // action: 'read',
    // expires: '03-09-2491', // Set expiration date for the URL
    // });

    // const imageUrl = signedUrl;

    const imageUrl =  await getDownloadURL(imageRef);


    //const imageUrl = `https://storage.googleapis.com/${process.env.FIREBASE_STORAGE_BUCKET}/places/${imageName}`;

    const createdPlace = new Place({
      title,
      description,
      address,
      location: coordinates,
      image: imageUrl,
      creator: req.userData.userId,
    });

    let user;
    try {
      user = await User.findById(req.userData.userId);
    } catch (err) {
      const error = new HttpError("Creating place failed, please try again", 500);
      return next(error);
    }

    if (!user) {
      const error = new HttpError("Could not find user for provided id", 404);
      return next(error);
    }


    try {
      const sess = await mongoose.startSession();
      sess.startTransaction();
      await createdPlace.save({ session: sess });
      user.places.push(createdPlace);
      await user.save({ session: sess });
      await sess.commitTransaction();
    } catch (err) {
      console.log("idher2");
      console.log(err);
      const error = new HttpError("Creating place failed, please try again.", 500);
      return next(error);
    }

    res.status(201).json({ place: createdPlace });
  } catch (error) {
    return next(new HttpError("Image upload failed, please try again.", 500));
  }
};

const updatePlace = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new HttpError("Invalid inputs passed, please check your data.", 422)
    );
  }

  const { title, description } = req.body;
  const placeId = req.params.pid;

  let place;
  try {
    place = await Place.findById(placeId);
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, could not update place",
      500
    );
    return next(error);
  }

  if (place.creator.toString() !== req.userData.userId) {
    const error = new HttpError("You are not allowed to edit this place.", 401);
    return next(error);
  }

  place.title = title;
  place.description = description;

  try {
    await place.save();
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, could not update place",
      500
    );
    return next(error);
  }

  res.status(200).json({ place: place.toObject({ getters: true }) });
};

const deletePlace = async (req, res, next) => {
  const placeId = req.params.pid;

  let place;
  try {
    place = await Place.findById(placeId).populate("creator");
  } catch (err) {
    const error = new HttpError("Something went wrong, could not delete place.", 500);
    return next(error);
  }

  if (!place) {
    const error = new HttpError("Could not find place for this id.", 404);
    return next(error);
  }

  if (place.creator.id !== req.userData.userId) {
    const error = new HttpError("You are not allowed to delete this place.", 401);
    return next(error);
  }

  try {
    const sess = await mongoose.startSession();
    sess.startTransaction();
    await place.remove({ session: sess });
    place.creator.places.pull(place);
    await place.creator.save({ session: sess });
    await sess.commitTransaction();
  } catch (err) {
    const error = new HttpError("Something went wrong, could not delete place.", 500);
    return next(error);
  }

  // No local file deletion needed

  res.status(200).json({ message: "Deleted place." });
};

exports.getPlaceById = getPlaceById;
exports.getPlacesByUserId = getPlacesByUserId;
exports.createPlace = createPlace;
exports.updatePlace = updatePlace;
exports.deletePlace = deletePlace;
