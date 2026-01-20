const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret";

app.use(cors());
app.use(express.json());

function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).send("Unauthorized");
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).send("Invalid token");
  }
}

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  db.get(
    "SELECT * FROM voters WHERE username = ?",
    [username],
    (err, voter) => {
      if (!voter) return res.status(401).send("Invalid credentials");
      if (!bcrypt.compareSync(password, voter.password_hash))
        return res.status(401).send("Invalid credentials");

      const token = jwt.sign({ id: voter.id }, JWT_SECRET);
      res.json({ token, has_voted: voter.has_voted });
    }
  );
});

app.get("/api/candidates", auth, (req, res) => {
  db.all("SELECT * FROM candidates", [], (err, rows) => {
    res.json(rows);
  });
});

app.post("/api/vote", auth, (req, res) => {
  const voterId = req.user.id;
  const { selected } = req.body;

  if (!Array.isArray(selected) || selected.length !== 10)
    return res.status(400).send("Select exactly 10 candidates");

  db.get(
    "SELECT has_voted FROM voters WHERE id = ?",
    [voterId],
    (err, voter) => {
      if (voter.has_voted)
        return res.status(403).send("You already voted");

      db.serialize(() => {
        db.run("BEGIN");
        selected.forEach(id => {
          db.run(
            "INSERT INTO votes (voter_id, candidate_id) VALUES (?, ?)",
            [voterId, id]
          );
        });
        db.run("UPDATE voters SET has_voted = 1 WHERE id = ?", [voterId]);
        db.run("COMMIT");
        res.send("Vote submitted");
      });
    }
  );
});

app.listen(PORT, () => console.log("Server running on port " + PORT));