const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");
const dotenv = require("dotenv");
const mongodb = require("mongodb");

const port = process.env.PORT || 3000;
dotenv.config();

const dbName = "testing";
const collName1 = "searchResults";

app.use(bodyParser.json());
app.use(cors());

app.listen(port, () => {
  console.log("app listing in port " + port);
});

//mongodb

//mongodb://localhost:27017/?readPreference=primary&appname=MongoDB%20Compass%20Community&ssl=false
const uri = `mongodb+srv://johnjohn:johnjohn@cluster0-lyx1k.mongodb.net/testing?retryWrites=true&w=majority`;
// const uri = `mongodb://localhost:27017/?readPreference=primary&ssl=false`;
const mongoClient = mongodb.MongoClient;

app.get("/", async (req, res) => {
  let pagination = 10;
  let offset = 0;
  let queries = req.query.q;
  let temp_pagination = req.query.pagination;
  let temp_offset = req.query.offset;
  if (temp_pagination) pagination = parseInt(temp_pagination);
  if (temp_offset) offset = parseInt(temp_offset);
  offset = pagination * offset;
  if (queries) queries = queries.split(" ");
  else return;
  console.log(queries, offset, pagination);
  let regex = new RegExp(queries.join("|"));
  const client = await mongoClient
    .connect(uri, {
      useUnifiedTopology: true,
    })
    .catch((err) => {
      return;
    });
  if (!client) {
    res.status(500).json({ message: "server error" });
    console.log("couldnt connect!");
    return;
  }
  let collection = client.db(dbName).collection(collName1);
  try {
    let result = await collection
      .find(
        {
          $or: [{ keywords: { $in: queries } }, { title: regex }],
        },
        { limit: pagination, skip: offset, projection: { keywords: 0, _id: 0 } }
      )
      .toArray();
    result.map((obj) => {
      if (obj["description"].length == 0)
        obj["description"] = ["No Description Found"];
      return obj;
    });
    res.status(200).json({ results: result });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "server error" });
  } finally {
    client.close();
  }
});
