import "dotenv/config";
import { isRequestSuitable } from "../utils/functions/supportrequest";

async function main() {
  const content = process.argv.slice(2).join(" ").trim();

  if (!content) {
    throw new Error("provide support request content as a CLI argument");
  }

  const result = await isRequestSuitable(content);

  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("failed to run support request suitability test");
    console.error(error);
    process.exit(1);
  });
