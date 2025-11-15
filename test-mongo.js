const { MongoClient } = require("mongodb");

const uri = "mongodb+srv://alialherz777_db_user:Ali51103test123@cluster0.xscioz7.mongodb.net/?appName=Cluster0";

const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("✅ Ping OK – connected to MongoDB!");
  } catch (err) {
    console.error("❌ Connection failed:", err);
  } finally {
    await client.close();
  }
}

run();
