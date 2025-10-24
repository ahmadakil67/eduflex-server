require("dotenv").config();
const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const port = process.env.PORT || 3000;
const app = express();

// ---- CORS (exact-origin echo; credentials allowed)
const allowedOrigins = new Set([
  "http://localhost:5173",
  "https://event-explorer-cdca0.web.app",
  // add your production FE domain here when you have one, e.g.:
  // "https://eduflex.vercel.app",
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(200).end();
  next();
});

app.use(express.json());
app.set("timeout", 120000);

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.1yoqumf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

async function run() {
  const db = client.db("courseManagement");
  const courseCollection = db.collection("courses");
  const enrollmentCollection = db.collection("enrollments");
  const discussionsCollection = db.collection("discussions");

  // ---- HEALTH
  app.get("/", (_req, res) => res.json({ ok: true, msg: "Course Management Server is running" }));

  // ---- COURSES
  app.get("/courses", async (req, res) => {
    const { email } = req.query;
    const query = email ? { userEmail: email } : {};
    const result = await courseCollection.find(query).sort({ createdAt: -1 }).limit(6).toArray();
    res.json(result);
  });

  app.get("/courses/:id", async (req, res) => {
    try {
      const course = await courseCollection.findOne({ _id: new ObjectId(req.params.id) });
      if (!course) return res.status(404).json({ message: "Course not found" });
      res.json(course);
    } catch {
      res.status(400).json({ message: "Invalid course id" });
    }
  });

  app.post("/courses", async (req, res) => {
    const newCourse = { ...req.body, createdAt: new Date() };
    const result = await courseCollection.insertOne(newCourse);
    res.json(result);
  });

  app.put("/courses/:id", async (req, res) => {
    const result = await courseCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body }
    );
    res.json(result);
  });

  app.delete("/courses/:id", async (req, res) => {
    const result = await courseCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json(result);
  });

  // ---- DISCUSSIONS (unchanged except use res.json everywhere)
  app.get("/discussions", async (_req, res) => {
    const discussions = await discussionsCollection.find().sort({ timestamp: -1 }).toArray();
    res.status(200).json(discussions);
  });

  app.post("/discussions", async (req, res) => {
    const { content, author, authorId } = req.body;
    const newDiscussion = { content, author, authorId, timestamp: new Date(), votes: 0, replies: [] };
    const result = await discussionsCollection.insertOne(newDiscussion);
    res.status(201).json({ insertedId: result.insertedId });
  });

  app.put("/discussions/vote/:id", async (req, res) => {
    const id = req.params.id;
    const post = await discussionsCollection.findOne({ _id: new ObjectId(id) });
    if (!post) return res.status(404).json({ message: "Post not found" });
    await discussionsCollection.updateOne({ _id: new ObjectId(id) }, { $inc: { votes: 1 } });
    const updated = await discussionsCollection.findOne({ _id: new ObjectId(id) });
    res.json(updated);
  });

  app.put("/discussions/:id", async (req, res) => {
    const id = req.params.id;
    const { content } = req.body;
    const post = await discussionsCollection.findOne({ _id: new ObjectId(id) });
    if (!post) return res.status(404).json({ message: "Post not found" });
    await discussionsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { content } });
    res.json({ message: "Post updated!" });
  });

  app.delete("/discussions/:id", async (req, res) => {
    const result = await discussionsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 1) return res.json({ message: "Post deleted!" });
    res.status(404).json({ message: "Post not found" });
  });

  app.delete("/discussions/reply/:postId/:replyIndex", async (req, res) => {
    const { postId, replyIndex } = req.params;
    const post = await discussionsCollection.findOne({ _id: new ObjectId(postId) });
    if (!post || post.replies.length <= +replyIndex) return res.status(404).json({ message: "Reply not found" });
    post.replies.splice(+replyIndex, 1);
    await discussionsCollection.updateOne({ _id: new ObjectId(postId) }, { $set: { replies: post.replies } });
    res.json({ message: "Reply deleted!" });
  });

  // ---- ENROLLMENTS

  // FIXED: query with ObjectId to match stored type
  app.get("/enrollments/:courseId", async (req, res) => {
    const userEmail = req.query.email;
    const courseId = req.params.courseId;
    if (!userEmail) return res.status(400).json({ message: "Missing email" });

    let enrollment;
    try {
      enrollment = await enrollmentCollection.findOne({
        userEmail,
        courseId: new ObjectId(courseId), // <-- FIXED
      });
    } catch {
      return res.status(400).json({ message: "Invalid course id" });
    }

    res.json(Boolean(enrollment));
  });

  app.post("/enroll", async (req, res) => {
    const { userEmail, courseId } = req.body;
    if (!userEmail || !courseId) return res.status(400).json({ message: "Missing userEmail or courseId" });

    const existing = await enrollmentCollection.findOne({
      userEmail,
      courseId: new ObjectId(courseId), // ensure same type
    });
    if (existing) return res.status(400).json({ message: "Already enrolled" });

    const course = await courseCollection.findOne({ _id: new ObjectId(courseId) });
    if (!course) return res.status(404).json({ message: "Course not found" });

    const doc = {
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
    const result = await enrollmentCollection.insertOne(doc);
    res.json({ message: "Enrolled successfully", enrolledId: result.insertedId });
  });

  app.get("/enrollments", async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: "Missing email" });
    const enrollments = await enrollmentCollection.find({ userEmail: email }).toArray();
    res.json(enrollments);
  });

  app.delete("/enrollments/:id", async (req, res) => {
    const result = await enrollmentCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json(result);
  });

  // ---- POPULAR COURSES
  app.get("/popular-courses", async (_req, res) => {
    try {
      const popularCourses = await enrollmentCollection
        .aggregate([
          {
            $group: {
              _id: "$courseId",
              enrollments: { $sum: 1 },
              courseTitle: { $first: "$courseTitle" },
              shortDescription: { $first: "$shortDescription" },
              imageUrl: { $first: "$imageUrl" },
              duration: { $first: "$duration" },
              category: { $first: "$category" },
              instructor: { $first: "$instructor" },
              difficultyLevel: { $first: "$difficultyLevel" },
            },
          },
          { $sort: { enrollments: -1 } },
          { $limit: 6 },
        ])
        .toArray();

      if (!popularCourses.length) return res.status(404).json({ message: "No popular courses found" });
      res.json(popularCourses);
    } catch (error) {
      console.error("Error fetching popular courses:", error);
      res.status(500).json({ message: "Error loading courses", error: error.message });
    }
  });

  console.log("Connected to MongoDB");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

app.listen(port, () => console.log(`Server running on port ${port}`));
