const fs = require("fs");
const path = require("path");

const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");

const usersRoutes = require("./routes/users-routes");
const placesRoutes = require("./routes/places-routes");
const HttpError = require("./models/http-error");
const cors = require("cors");

const corsOptions ={
   origin:'*', 
   credentials:true,            //access-control-allow-credentials:true
   optionSuccessStatus:200,
}
const app = express();

app.use(cors(corsOptions))

app.use(bodyParser.json());

app.use("/uploads/images", express.static(path.join("uploads", "images")));

// Routes
app.use("/api/places", placesRoutes);
app.use("/api/users", usersRoutes);

// Error handling for unknown routes
app.use((req, res, next) => {
  const error = new HttpError("Could not find this route.", 404);
  throw error;
});

// General error handling middleware
app.use((error, req, res, next) => {
  if (req.file) {
    fs.unlink(req.file.path, (err) => {
      console.log(err);
    });
  }
  if (res.headersSent) {
    return next(error);
  }
  res.status(error.code || 500);
  res.json({ message: error.message || "An unknown error occurred." });
});

// Connect to MongoDB and start the server
mongoose
  .connect(
       `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.h7d4zwb.mongodb.net/${process.env.DB_NAME}?retryWrites=true&w=majority`
  )
  .then(() => {
    app.listen(process.env.PORT || 5000);
  })
  .catch((err) => {
    console.log(err);
  });


 


