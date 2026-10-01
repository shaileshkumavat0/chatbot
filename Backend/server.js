import express from "express";
import "dotenv/config";
import cors from "cors";
import mongoose from "mongoose";
import chatRoutes from "./routes/chat.js";

const app = express();
const PORT = 8080;

app.use(express.json());
app.use(cors());

app.use("/api", chatRoutes);

// Without this, mongoose holds every query for 10s when the DB is unreachable,
// so each chat message stalls for 10 seconds before failing. Failing fast means
// the user gets an error message right away.
mongoose.set("bufferTimeoutMS", 4000);

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
  connectDB();
});

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected with Database!");
  } catch (err) {
    console.log(err);
    console.log("Failed to connect with Db", err);
  }
};
