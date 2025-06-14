const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;
const app = express();

const cors = require("cors");

app.use(cors());
app.use(express.json());

require("dotenv").config();

app.set("timeout", 120000);

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.1yoqumf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const courseCollection = client
      .db("courseManagement")
      .collection("courses");
    const enrollmentCollection = client
      .db("courseManagement")
      .collection("enrollments");

    app.get("/courses", async (req, res) => {
      const { email } = req.query;
      const query = email ? { userEmail: email } : {};
      const result = await courseCollection.find(query).toArray();
      res.send(result);
    });

    app.put("/courses/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const result = await courseCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );
      res.send(result);
    });

    app.delete("/courses/:id", async (req, res) => {
      const id = req.params.id;
      const result = await courseCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    app.get("/courses/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await courseCollection.findOne(query);
      res.send(result);
    });

    app.post("/courses", async (req, res) => {
      const newRoommate = req.body;
      console.log(newRoommate);
      const result = await courseCollection.insertOne(newRoommate);
      res.send(result);
    });

    app.get("/enrollment/:courseId", async (req, res) => {
      const userEmail = req.query.email;
      const courseId = req.params.courseId;

      const enrollment = await enrollmentCollection.findOne({
        userEmail,
        courseId,
      });

      res.send(enrollment ? true : false); // Returns true if the user is enrolled
    });

    // Enroll a user in the course
    app.post("/enroll", async (req, res) => {
      const { userEmail, courseId } = req.body;

      try {
        // Check if the user is already enrolled in the course
        const existingEnrollment = await enrollmentCollection.findOne({
          userEmail,
          courseId,
        });

        if (existingEnrollment) {
          return res.status(400).send({ message: "Already enrolled" });
        }

        // Fetch the course details from the courses collection
        const course = await courseCollection.findOne({
          _id: new ObjectId(courseId),
        });

        if (!course) {
          return res.status(404).send({ message: "Course not found" });
        }

        // Create the enrollment document with course details
        const newEnrollment = {
          userEmail,
          courseId: new ObjectId(courseId),
          courseTitle: course.courseTitle,
          shortDescription: course.shortDescription,
          imageUrl: course.imageUrl,
          duration: course.duration,
          category: course.category,
          instructor: course.instructor,
          difficultyLevel: course.difficultyLevel,
          enrolledAt: new Date(),
        };

        // Insert the new enrollment document into the enrollments collection
        const result = await enrollmentCollection.insertOne(newEnrollment);

        res.send({
          message: "Enrolled successfully",
          enrolledId: result.insertedId,
        });
      } catch (error) {
        console.error("Error enrolling in the course:", error);
        res
          .status(500)
          .send({ message: "Error enrolling", error: error.message });
      }
    });
    // Fetch all enrollments for a specific user
    app.get("/enrollments", async (req, res) => {
      const { email } = req.query;
      const enrollments = await enrollmentCollection
        .find({ userEmail: email })
        .toArray();
      res.send(enrollments);
    });

    // Remove the user's enrollment
    app.delete("/enrollments/:id", async (req, res) => {
      const { id } = req.params;
      const result = await enrollmentCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result); // Send response indicating whether the deletion was successful
    });

    app.get("/popular-courses", async (req, res) => {
      try {
        const popularCourses = await enrollmentCollection
          .aggregate([
            {
              $group: {
                _id: "$courseId", // Group by courseId from enrollments
                enrollments: { $sum: 1 }, // Count enrollments for each course
                courseTitle: { $first: "$courseTitle" }, // Get the course title from the first document
                shortDescription: { $first: "$shortDescription" }, // Get the short description
                imageUrl: { $first: "$imageUrl" }, // Get the image URL
                duration: { $first: "$duration" }, // Get the duration
                category: { $first: "$category" }, // Get the category
                instructor: { $first: "$instructor" }, // Get the instructor
                difficultyLevel: { $first: "$difficultyLevel" }, // Get the difficulty level
              },
            },
            { $sort: { enrollments: -1 } }, // Sort by enrollments in descending order
            { $limit: 3 }, // Limit to the top 3 most enrolled courses
          ])
          .toArray(); // Convert the aggregation result to an array

        console.log("Popular Courses:", popularCourses); // Log the result to debug

        if (popularCourses.length === 0) {
          return res.status(404).json({ message: "No popular courses found" });
        }

        res.json(popularCourses); // Send the combined data to the frontend
      } catch (error) {
        console.error("Error fetching popular courses:", error);
        res
          .status(500)
          .json({ message: "Error loading courses", error: error.message });
      }
    });

    // app.get("/check-enrollments", async (req, res) => {
    //   try {
    //     const enrollments = await enrollmentCollection.find().toArray();
    //     res.json(enrollments);
    //   } catch (error) {
    //     res.status(500).json({ message: "Error checking enrollments", error: error.message });
    //   }
    // });

    // Define Mongoose Schema for Discussions
    const discussionSchema = new Schema({
      content: String,
      author: String,
      authorId: String,
      votes: { type: Number, default: 0 },
      timestamp: { type: Date, default: Date.now },
      replies: [
        {
          content: String,
          author: String,
          authorId: String,
          timestamp: { type: Date, default: Date.now },
        },
      ],
    });

    const Discussion = mongoose.model("Discussion", discussionSchema);

    // Create a new discussion post
    app.post("/api/discussions", async (req, res) => {
      try {
        const newDiscussion = new Discussion(req.body);
        await newDiscussion.save();
        res.status(201).json(newDiscussion);
      } catch (error) {
        res.status(500).json({ message: "Error saving discussion", error });
      }
    });

    // Get all discussions
    app.get("/api/discussions", async (req, res) => {
      try {
        const discussions = await Discussion.find().sort({ timestamp: -1 }); // Sort by latest
        res.status(200).json(discussions);
      } catch (error) {
        res.status(500).json({ message: "Error fetching discussions", error });
      }
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Course Management Server is running");
});
app.listen(port, () => console.log(`Server running on port ${port}`));
