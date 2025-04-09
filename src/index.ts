const AnyList = require("anylist");
import * as dotenv from "dotenv";
import * as fs from "fs/promises";
import * as path from "path";

dotenv.config();

async function downloadRecipes() {
  const anylist = new AnyList({
    email: process.env.ANYLIST_EMAIL!,
    password: process.env.ANYLIST_PASSWORD!,
  });

  try {
    // Login to AnyList
    console.log("Logging in to AnyList...");
    await anylist.login();

    // Get all recipes
    console.log("Fetching recipes...");
    const recipes = await anylist.getRecipes();

    // Create output directory if it doesn't exist
    const outputDir = path.join(__dirname, "..", "recipes");
    await fs.mkdir(outputDir, { recursive: true });

    await fs.writeFile(
      path.join(outputDir, "recipes.json"),
      JSON.stringify(recipes, null, 2),
      "utf-8"
    );

    console.log(
      `Successfully downloaded ${recipes.length} recipes to recipes/recipes.json`
    );

    // Cleanup
    await anylist.teardown();
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

downloadRecipes();
