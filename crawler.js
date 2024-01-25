const dotenv = require("dotenv");
const mongodb = require("mongodb");
var request = require("request");
var cheerio = require("cheerio");

const port = process.env.PORT || 3000;
dotenv.config();

const dbName = "SearchEngine";
const collName1 = "searchResults";
const collName2 = "toCrawl";

const checkpoint_interval = 6;
const documents_overhead = 100;
let checkpoint_time = Date.now();

//mongodb

const uri = `mongodb+srv://${process.env.D_EMAIL}:${process.env.D_PASSWORD}@cluster0-lyx1k.mongodb.net/testing?retryWrites=true&w=majority`;

const mongoClient = mongodb.MongoClient;

// ======crawler>
let filteredLinks = [];
let seedLinks = [
  "https://medium.com/",
  "https://www.udacity.com/school-of-programming",
  "https://www.reddit.com/",
  "https://www.quora.com/",
  "https://www.theguardian.com/",
  "https://www.hindustantimes.com/",
  "https://www.nytimes.com/",
  "https://www.geeksforgeeks.org/",
  "https://www.nationalgeographic.com/",
  "https://get.tech/blog/50-tech-websites-to-follow-in-2020/",
  "https://www.forbes.com/",
];

resumeCrawl();

function isWithinInterval(timestamp1, timestamp2, intervalSeconds) {
  const differenceInSeconds = Math.abs((timestamp1 - timestamp2) / 1000);
  return differenceInSeconds >= intervalSeconds;
}

async function clearOldIndexes() {
  const client = await mongoClient.connect(uri, { useUnifiedTopology: true });
  if (!client) return;

  const collection = client.db(dbName).collection(collName2);

  try {
    let maxIndex = await collection.find().sort({"index" : -1}).limit(1).toArray();
    maxIndex = maxIndex[0].index;
    const documentsToKeep = Math.max(0, maxIndex - documents_overhead);
    await collection.deleteMany({ index: { $lt: documentsToKeep } });
    console.log(`Cleared old indexes. maxindex: ${maxIndex}`);
  } catch (err) {
    console.error("Failed to clear old indexes:", err);
  } finally {
    client.close();
  }
}

async function crawl(array, currentIndex) {
  for (let i = currentIndex; i < array.length; i++) {
    let newObj = await createObj(array[i]);
    if (!newObj) continue;
    array = [...array, ...newObj["links"]];
    array = [...new Set(array)];
    if (newObj["obj"]["title"].length > 0) {
      filteredLinks.push(newObj["obj"]);
    }
    if (filteredLinks.length > 9) {
      console.log("uploading indexes ....");
      let result = await uploadIndexes(filteredLinks, collName1);
      if (result) {
        console.log("uploading crawl data....");
        filteredLinks = [];
        result = await uploadUrls(array, collName2, i + 1);
      }
    }
    if (isWithinInterval(checkpoint_time, Date.now(), checkpoint_interval)){
      await clearOldIndexes();
      checkpoint_time = Date.now();
    }
  }
}

async function resumeCrawl() {
  const client = await mongoClient
    .connect(uri, {
      useUnifiedTopology: true,
    })
    .catch((err) => {
      resolve(false);
      return;
    });
  if (!client) {
    resolve(false);
    return;
  }
  let collection = client.db(dbName).collection(collName2);
  let currentIndex = 0;
  try {
    let result = await collection.find({}).toArray();
    if (result.length == 0) result = seedLinks;
    else {
      result = result.map((e, i) => {
        if (e["current"]) {
          currentIndex = i;
        }
        return e["link"];
      });
    }
    crawl(result, currentIndex);
  } catch (err) {
    console.log(err);
    console.error("failed to restart crawl!");
    return;
  } finally {
    client.close();
  }
}

async function createObj(link) {
  return new Promise((resolve, reject) => {
    console.log("loading: ", link);
    let req = request({ timeout: 2500, url: link }, function (
      err,
      response,
      body
    ) {
      if (err) {
        console.log("skipped");
        resolve(false);
        return;
      } else if (response.statusCode === 200) {
        // Parse the document body
        let $ = cheerio.load(body);
        let obj = { title: [], description: [], keywords: [], link, crawl_ts: Date.now() };
        $("title").each((index, element) => {
          if ($(element).text())
            obj["title"].push($(element).text().replace(/\n/g, " ").trim());
        });
        $("meta[name='description']").each((index, element) => {
          if ($(element).attr("content"))
            obj["description"].push(
              $(element).attr("content").replace(/\n/g, " ")
            );
        });
        $("meta[name='keywords']").each((index, element) => {
          if ($(element).attr("content")) {
            let temp = $(element)
              .attr("content")
              .replace(/\s+/g, "")
              .split(",");
            obj["keywords"].push(...temp);
          }
        });
        let links = [];
        $('.title a[href^="http"], a[href^="https"]').each((index, element) => {
          links.push($(element).attr("href").trim());
        });
        resolve({ obj, links });
      } else resolve(false);
    });
  });
}
async function uploadIndexes(array, collectionName) {
  return new Promise(async (resolve, reject) => {
    const client = await mongoClient
      .connect(uri, {
        useUnifiedTopology: true,
      })
      .catch((err) => {
        resolve(false);
        return;
      });
    if (!client) {
      resolve(false);
      return;
    }
    let collection = client.db(dbName).collection(collectionName);
    try {
      await collection.insertMany(array);
      resolve(true);
    } catch (err) {
      resolve(false);
      return;
    } finally {
      client.close();
    }
  });
}
async function uploadUrls(array, collectionName, currentIndex) {
  return new Promise(async (resolve, reject) => {
    const client = await mongoClient
      .connect(uri, {
        useUnifiedTopology: true,
      })
      .catch((err) => {
        resolve(false);
        return;
      });
    if (!client) {
      resolve(false);
      return;
    }
    let collection = client.db(dbName).collection(collectionName);
    try {
      let length = await collection.countDocuments();
      console.log(length);
      array = array.slice(length);
      array = array.map((e, i) => {
        return { link: e, index: length + i };
      });
      await collection.updateOne(
        { current: true },
        { $unset: { current: "" } }
      );

      await collection.insertMany(array);
      await collection.updateOne(
        { index: currentIndex },
        { $set: { current: true } }
      );
      resolve(true);
    } catch (err) {
      console.log(err);
      resolve(false);
      return;
    } finally {
      client.close();
    }
  });
}
